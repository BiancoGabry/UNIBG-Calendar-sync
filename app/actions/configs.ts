"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth/server";
import { getDb } from "@/lib/db/client";
import * as repo from "@/lib/db/repo";
import { errorMessage } from "@/lib/google/errors";
import { getGoogleStatus } from "@/lib/google/status";
import { NEW_YEAR_DISMISSED_STATE, NEW_YEAR_STATE } from "@/lib/sync/catalog-refresh";
import { newConfigId } from "@/lib/sync/ids";
import { runSync, teardown, type PlanPreviewItem, type RunResult } from "@/lib/sync/run";
import type { ActionResult } from "./catalog";

const optionsSchema = z.object({
  titlePrefix: z.enum(["never", "nonLesson", "always"]),
  reminder: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("none") }),
    z.object({ mode: z.literal("default") }),
    z.object({ mode: z.literal("minutes"), minutes: z.number().int().min(0).max(40320) }),
  ]),
  includeRecommended: z.boolean(),
  colorId: z
    .string()
    .regex(/^([1-9]|1[01])$/)
    .nullable(),
});

const configInput = z.object({
  id: z
    .string()
    .regex(/^[0-9a-f]{8}$/)
    .optional(),
  aa: z.string().regex(/^\d{4}$/),
  aaLabel: z.string().min(1),
  courseCode: z.string().min(1),
  courseLabel: z.string().min(1),
  curricula: z.array(z.object({ value: z.string().min(1), label: z.string() })).min(1),
  selectedCourses: z.array(z.string().min(1)),
  excludedCourses: z.array(z.string().min(1)),
  surnameInitial: z.string().max(1),
  calendarId: z.string().min(1).nullable(),
  calendarName: z.string().nullable(),
  calendarColor: z.string().nullable(),
  options: optionsSchema,
});

export type ConfigInput = z.input<typeof configInput>;

export async function saveConfigAction(input: ConfigInput): Promise<ActionResult<{ id: string }>> {
  await requireSession();
  const parsed = configInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dati non validi: " + parsed.error.issues[0]?.message };
  const v = parsed.data;
  const db = getDb();
  const values = {
    name: `${v.courseLabel} – ${v.curricula.map((c) => c.label).join(", ")}`,
    aa: v.aa,
    aaLabel: v.aaLabel,
    courseCode: v.courseCode,
    courseLabel: v.courseLabel,
    curricula: v.curricula,
    selectedCourses: [...new Set(v.selectedCourses)],
    excludedCourses: [...new Set(v.excludedCourses)].filter((c) => !v.selectedCourses.includes(c)),
    surnameInitial: v.surnameInitial.toUpperCase(),
    calendarId: v.calendarId,
    calendarName: v.calendarName,
    calendarColor: v.calendarColor,
    options: v.options,
  };
  if (v.id) {
    const existing = repo.getConfig(db, v.id);
    if (!existing) return { ok: false, error: "Configurazione inesistente" };
    if (existing.calendarId && v.calendarId !== existing.calendarId && repo.loadSnapshot(db, v.id).length > 0) {
      return {
        ok: false,
        error:
          'Per cambiare calendario prima usa "Disattiva e rimuovi eventi": gli eventi già creati sono sul calendario attuale.',
      };
    }
    const selected = new Set(values.selectedCourses);
    const handled = new Set([...values.selectedCourses, ...values.excludedCourses]);
    repo.updateConfig(db, v.id, {
      ...values,
      pendingCourses: existing.pendingCourses.filter((p) => !handled.has(p.code) && !selected.has(p.code)),
    });
    revalidatePath("/");
    return { ok: true, data: { id: v.id } };
  }
  const id = newConfigId();
  repo.insertConfig(db, { id, ...values, status: "draft" });
  revalidatePath("/");
  return { ok: true, data: { id } };
}

/** Starts a real sync in the background and returns the run id for progress polling. */
function startInBackground(id: string, force = false): Promise<{ runId: number | null; error?: string }> {
  return new Promise((resolve) => {
    runSync(id, { trigger: "ui", force, onRunCreated: (runId) => resolve({ runId }) })
      .then((r) => resolve({ runId: r.runId, error: r.error }))
      .catch((err) => resolve({ runId: null, error: errorMessage(err) }));
  });
}

export async function activateConfigAction(id: string): Promise<ActionResult<{ runId: number | null }>> {
  await requireSession();
  const db = getDb();
  const config = repo.getConfig(db, id);
  if (!config) return { ok: false, error: "Configurazione inesistente" };
  if (!config.calendarId) return { ok: false, error: "Scegli prima un calendario Google" };
  if (config.selectedCourses.length === 0) return { ok: false, error: "Nessun insegnamento selezionato" };
  repo.updateConfig(db, id, { status: "active", pauseReason: null });
  repo.addLog(db, { configId: id, level: "info", kind: "activated", message: "Sincronizzazione attivata" });
  const started = await startInBackground(id);
  revalidatePath("/");
  return started.runId || !started.error
    ? { ok: true, data: { runId: started.runId } }
    : { ok: false, error: started.error! };
}

export async function syncNowAction(
  id: string,
  opts: { force?: boolean } = {},
): Promise<ActionResult<{ runId: number | null }>> {
  await requireSession();
  const started = await startInBackground(id, opts.force === true);
  revalidatePath("/");
  if (!started.runId && started.error) return { ok: false, error: started.error };
  return { ok: true, data: { runId: started.runId } };
}

export type DryRunData = Pick<RunResult, "status" | "summary" | "anomaly" | "error"> & { plan: PlanPreviewItem[] };

export async function dryRunAction(id: string): Promise<ActionResult<DryRunData>> {
  await requireSession();
  const r = await runSync(id, { trigger: "ui", dryRun: true });
  if (r.status === "error") return { ok: false, error: r.error ?? "Errore" };
  return { ok: true, data: { status: r.status, summary: r.summary, anomaly: r.anomaly, error: r.error, plan: r.plan } };
}

export async function pauseConfigAction(id: string): Promise<ActionResult<null>> {
  await requireSession();
  repo.updateConfig(getDb(), id, { status: "paused", pauseReason: "user" });
  repo.addLog(getDb(), { configId: id, level: "info", kind: "paused", message: "Sincronizzazione in pausa" });
  revalidatePath("/");
  return { ok: true, data: null };
}

export async function resumeConfigAction(id: string): Promise<ActionResult<null>> {
  await requireSession();
  const db = getDb();
  if (getGoogleStatus(db)?.status === "invalid_credentials") {
    return {
      ok: false,
      error: 'Google rifiuta la chiave del service account: sostituiscila e premi "Verifica credenziali"',
    };
  }
  repo.updateConfig(db, id, { status: "active", pauseReason: null });
  repo.addLog(db, { configId: id, level: "info", kind: "resumed", message: "Sincronizzazione ripresa" });
  revalidatePath("/");
  return { ok: true, data: null };
}

export async function teardownConfigAction(id: string): Promise<ActionResult<{ deleted: number }>> {
  await requireSession();
  try {
    const r = await teardown(id);
    revalidatePath("/");
    return { ok: true, data: { deleted: r.deleted } };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function deleteConfigAction(id: string): Promise<ActionResult<null>> {
  await requireSession();
  const db = getDb();
  if (repo.loadSnapshot(db, id).length > 0) {
    return { ok: false, error: 'Ci sono eventi creati: usa prima "Disattiva e rimuovi eventi"' };
  }
  repo.deleteConfig(db, id);
  revalidatePath("/");
  return { ok: true, data: null };
}

export async function resolvePendingAction(
  id: string,
  codes: string[],
  decision: "approve" | "reject",
): Promise<ActionResult<null>> {
  await requireSession();
  const db = getDb();
  const config = repo.getConfig(db, id);
  if (!config) return { ok: false, error: "Configurazione inesistente" };
  const set = new Set(codes);
  repo.updateConfig(db, id, {
    pendingCourses: config.pendingCourses.filter((p) => !set.has(p.code)),
    selectedCourses:
      decision === "approve" ? [...new Set([...config.selectedCourses, ...codes])] : config.selectedCourses,
    excludedCourses:
      decision === "reject" ? [...new Set([...config.excludedCourses, ...codes])] : config.excludedCourses,
  });
  const names = config.pendingCourses.filter((p) => set.has(p.code)).map((p) => p.name);
  repo.addLog(db, {
    configId: id,
    level: "info",
    kind: decision === "approve" ? "course_approved" : "course_rejected",
    message: `${decision === "approve" ? "Aggiunti" : "Esclusi"}: ${names.join(", ")}`,
  });
  revalidatePath("/");
  return { ok: true, data: null };
}

export async function dismissNewYearAction(): Promise<ActionResult<null>> {
  await requireSession();
  const db = getDb();
  repo.setState(db, NEW_YEAR_DISMISSED_STATE, repo.getState<{ value: string }>(db, NEW_YEAR_STATE)?.value ?? null);
  revalidatePath("/");
  return { ok: true, data: null };
}
