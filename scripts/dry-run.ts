// Real dry-run against EasyStaff, without Google and without writing anything:
//   pnpm dry-run                                  → 21-R, PDS0-2012|1 (default), all teachings
//   pnpm dry-run -- --course 21-R --curriculum "PDS0-2012|1" --initial R
// Prints the actions a first sync would perform.
import { parseArgs } from "node:util";
import { parseCourses, fetchCoursesText } from "@/lib/easystaff/combo";
import { buildTeachingItems, groupTeachings, suggestExercises } from "@/lib/easystaff/courses";
import { EasyStaffClient } from "@/lib/easystaff/http";
import { fetchLessons } from "@/lib/easystaff/lessons";
import { diff } from "@/lib/sync/diff";
import { DEFAULT_EVENT_OPTIONS } from "@/lib/sync/event";
import * as f from "@/lib/sync/format";
import { buildPlan, summarizePlan } from "@/lib/sync/plan";
import { safetyCheck } from "@/lib/sync/safety";

const { values } = parseArgs({
  options: {
    aa: { type: "string", default: "2026" },
    course: { type: "string", default: "21-R" },
    curriculum: { type: "string", multiple: true, default: ["PDS0-2012|1"] },
    initial: { type: "string", default: "" },
    all: { type: "boolean", default: false }, // print every action, not only the first 40
  },
});

const base = process.env.EASYSTAFF_BASE_URL ?? "https://logistica.unibg.it/PortaleStudenti/";
const client = new EasyStaffClient({ baseUrl: base, userAgent: "unibg-calendar-sync/1.0 (dry-run)" });

async function main() {
  const now = new Date();
  const combo = parseCourses(await fetchCoursesText(client, values.aa));
  const course = combo.elenco_corsi.find((c) => c.valore === values.course);
  if (!course) throw new Error(`Corso ${values.course} non trovato nell'A.A. ${values.aa}`);
  const curricula = values.curriculum.map((v) => {
    const y = course.elenco_anni.find((a) => a.valore === v);
    if (!y)
      throw new Error(
        `Anno/percorso ${v} non trovato. Disponibili: ${course.elenco_anni.map((a) => a.valore).join(", ")}`,
      );
    return { value: y.valore, label: y.label };
  });

  const grid = await fetchLessons(client, { aa: values.aa, course: values.course, curricula, date: now });
  const counts = new Map<string, number>();
  for (const l of grid.lessons) counts.set(l.courseCode, (counts.get(l.courseCode) ?? 0) + 1);
  const groups = groupTeachings(
    buildTeachingItems({ course, curricula: curricula.map((c) => c.value), legend: grid.legend, lessonCounts: counts }),
  );

  // Selection: every required main teaching + exercises of the given initial (all exercises if none).
  const suggestion = suggestExercises(groups, values.initial);
  const selected = new Set(
    groups.flatMap((g) => [
      ...(g.main && g.main.required !== false ? [g.main.code] : []),
      ...g.exercises.filter((e) => (values.initial ? suggestion.selected.has(e.code) : true)).map((e) => e.code),
    ]),
  );
  const selection = { courses: selected, includeRecommended: DEFAULT_EVENT_OPTIONS.includeRecommended };

  console.log(
    `\n${course.label} [${course.valore}] – A.A. ${grid.academicYearLabel} – ${curricula.map((c) => c.label).join(", ")}`,
  );
  console.log(
    `Finestra: ${grid.window.firstDay} → ${grid.window.lastDay} · ${grid.lessons.length} lezioni · ${grid.closures.length} chiusure · aggiornato ${grid.fileDate} · modalità ${grid.mode}`,
  );
  for (const p of grid.periods) console.log(`Periodo: ${p.label} (anno ${p.year}) ${p.start} → ${p.end}`);
  console.log("\nInsegnamenti selezionati:");
  for (const g of groups) {
    for (const i of [...(g.main ? [g.main] : []), ...g.exercises]) {
      console.log(
        `  [${selected.has(i.code) ? "x" : " "}] ${i.name} (${i.code}) – ${i.lessonCount} lezioni${i.required === false ? " – consigliato" : ""}`,
      );
    }
  }

  const safety = safetyCheck({
    fetch: { ok: true, lessons: grid.lessons, window: grid.window },
    prev: [],
    prevResponseCount: null,
    selection,
    now,
  });
  const actions = diff([], grid.lessons, now, { selection, window: grid.window });
  const ops = buildPlan({
    actions,
    prev: [],
    current: grid.lessons,
    selection,
    ctx: { configId: "00000000", aa: values.aa, portalBaseUrl: base, options: DEFAULT_EVENT_OPTIONS },
    now,
  });

  console.log(`\nSafety check: ${safety.ok ? "ok" : `ANOMALIA – ${safety.anomaly.message}`}`);
  console.log(`Azioni previste al primo sync (${f.dateTime(now)}):`, summarizePlan(ops));
  for (const op of values.all ? ops : ops.slice(0, 40)) {
    if (op.kind === "upsert")
      console.log(
        `  + ${op.body.summary} | ${f.dayTime(op.body.start.dateTime)}–${f.time(op.body.end.dateTime)} | ${op.body.location ?? ""}`,
      );
    else console.log(`  - ${op.message}`);
  }
  if (!values.all && ops.length > 40) console.log(`  … e altre ${ops.length - 40} (usa --all)`);
  if (ops[0]?.kind === "upsert") {
    console.log("\nEsempio di corpo evento:\n" + JSON.stringify({ id: ops[0].eventId, ...ops[0].body }, null, 2));
  }
  if (grid.warnings.length) console.log("\nAvvisi di normalizzazione:", grid.warnings.slice(0, 10));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
