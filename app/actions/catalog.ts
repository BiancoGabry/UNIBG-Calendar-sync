"use server";

import { z } from "zod";
import { requireSession } from "@/lib/auth/server";
import { getDb } from "@/lib/db/client";
import { summarizeCatalog, type AcademicYear, type CatalogSummary } from "@/lib/easystaff/combo";
import { buildTeachingItems, groupTeachings, type TeachingGroup } from "@/lib/easystaff/courses";
import { EasyStaffError } from "@/lib/easystaff/http";
import type { CurriculumPeriod } from "@/lib/easystaff/normalize";
import { getAcademicYears, getCoursesCombo, getGridPreview } from "@/lib/easystaff/service";
import type { Closure, Lesson } from "@/lib/sync/types";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function fail(err: unknown): { ok: false; error: string } {
  if (err instanceof EasyStaffError) {
    return {
      ok: false,
      error:
        err.kind === "validation" || err.kind === "parse"
          ? `Il portale ha risposto con dati inattesi (${err.message})`
          : `Portale UniBG non raggiungibile: ${err.message}`,
    };
  }
  return { ok: false, error: (err as Error).message };
}

const aaSchema = z.string().regex(/^\d{4}$/);

export async function getAcademicYearsAction(): Promise<ActionResult<AcademicYear[]>> {
  await requireSession();
  try {
    return { ok: true, data: await getAcademicYears(getDb()) };
  } catch (err) {
    return fail(err);
  }
}

export async function getCatalogAction(aa: string): Promise<ActionResult<CatalogSummary>> {
  await requireSession();
  try {
    return { ok: true, data: summarizeCatalog(await getCoursesCombo(getDb(), aaSchema.parse(aa))) };
  } catch (err) {
    return fail(err);
  }
}

const detailsInput = z.object({
  aa: aaSchema,
  course: z.string().min(1),
  curricula: z.array(z.object({ value: z.string().min(1), label: z.string() })).min(1),
});

export type CourseDetails = {
  published: boolean;
  groups: TeachingGroup[];
  lessons: Lesson[];
  closures: Closure[];
  window: { firstDay: string; lastDay: string } | null;
  periods: CurriculumPeriod[];
  fileDate: string | null;
  generalNotes: string[];
  gridError: string | null;
};

/** Teachings of the chosen curricula (grouped) + the lessons for the preview. */
export async function loadCourseDetailsAction(
  input: z.input<typeof detailsInput>,
): Promise<ActionResult<CourseDetails>> {
  await requireSession();
  const req = detailsInput.parse(input);
  try {
    const combo = await getCoursesCombo(getDb(), req.aa);
    const course = combo.elenco_corsi.find((c) => c.valore === req.course);
    if (!course) return { ok: false, error: `Corso ${req.course} non trovato` };
    const published = course.pub_periodi.length > 0;
    const curricula = req.curricula.map((c) => c.value);

    let gridError: string | null = null;
    let grid = null;
    if (published) {
      try {
        grid = await getGridPreview({ aa: req.aa, course: req.course, curricula: req.curricula, date: new Date() });
      } catch (err) {
        gridError = fail(err).error;
      }
    }
    const counts = new Map<string, number>();
    for (const l of grid?.lessons ?? []) counts.set(l.courseCode, (counts.get(l.courseCode) ?? 0) + 1);
    const items = buildTeachingItems({ course, curricula, legend: grid?.legend, lessonCounts: counts });
    return {
      ok: true,
      data: {
        published,
        groups: groupTeachings(items),
        lessons: grid?.lessons ?? [],
        closures: grid?.closures ?? [],
        window: grid ? { firstDay: grid.window.firstDay, lastDay: grid.window.lastDay } : null,
        periods: grid?.periods ?? [],
        fileDate: grid?.fileDate ?? null,
        generalNotes: grid?.generalNotes ?? [],
        gridError,
      },
    };
  } catch (err) {
    return fail(err);
  }
}
