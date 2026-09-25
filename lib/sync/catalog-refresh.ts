// Daily job: reload combo.php (years + courses) to spot a new academic year, newly
// published periods and new teachings in the configured curricula.
import type { Db } from "@/lib/db/client";
import * as repo from "@/lib/db/repo";
import type { AcademicYear } from "@/lib/easystaff/combo";
import { getAcademicYears, getCoursesCombo } from "@/lib/easystaff/service";
import { logger } from "@/lib/log";

export const NEW_YEAR_STATE = "newAcademicYear";
export const NEW_YEAR_DISMISSED_STATE = "newAcademicYearDismissed";
export const CATALOG_REFRESH_STATE = "catalogRefreshedAt";

export async function refreshCatalog(db: Db): Promise<{ newYear: AcademicYear | null }> {
  const nowIso = new Date().toISOString();
  const years = await getAcademicYears(db, { maxAgeMs: 0 });
  const configs = repo.listConfigs(db);
  const latest = years[0] ?? null;

  let newYear: AcademicYear | null = null;
  if (latest && configs.length > 0) {
    const newestConfigured = Math.max(...configs.map((c) => Number(c.aa)));
    if (Number(latest.value) > newestConfigured) {
      newYear = latest;
      const previous = repo.getState<AcademicYear>(db, NEW_YEAR_STATE);
      if (previous?.value !== latest.value) {
        repo.setState(db, NEW_YEAR_STATE, latest);
        repo.addLog(db, {
          configId: null,
          level: "info",
          kind: "new_academic_year",
          message: `È disponibile l'A.A. ${latest.label}`,
        });
      }
    } else {
      repo.setState(db, NEW_YEAR_STATE, null);
    }
  }

  const configuredYears = [...new Set(configs.map((c) => c.aa))];
  for (const aa of configuredYears) {
    const combo = await getCoursesCombo(db, aa, { maxAgeMs: 0 });
    for (const config of configs.filter((c) => c.aa === aa)) {
      const course = combo.elenco_corsi.find((c) => c.valore === config.courseCode);
      if (!course) {
        repo.addLog(db, {
          configId: config.id,
          level: "warn",
          kind: "course_missing",
          message: `Il corso ${config.courseCode} non compare più nel catalogo dell'A.A. ${config.aaLabel}`,
        });
        continue;
      }

      // Newly published periods (e.g. "Secondo Semestre (S2)").
      const stateKey = `pubPeriods:${config.id}`;
      const known = repo.getState<string[]>(db, stateKey);
      const current = course.pub_periodi.map((p) => p.id);
      if (known) {
        for (const p of course.pub_periodi.filter((p) => !known.includes(p.id))) {
          repo.addLog(db, {
            configId: config.id,
            level: "info",
            kind: "period_published",
            message: `Pubblicato l'orario: ${p.label}`,
          });
        }
      }
      repo.setState(db, stateKey, current);

      // New teachings in the configured curricula: never synced until approved.
      const knownCodes = new Set([
        ...config.selectedCourses,
        ...config.excludedCourses,
        ...config.pendingCourses.map((p) => p.code),
      ]);
      const values = new Set(config.curricula.map((c) => c.value));
      const added = course.elenco_anni
        .filter((y) => values.has(y.valore))
        .flatMap((y) => y.elenco_insegnamenti)
        .filter((t, i, all) => !knownCodes.has(t.valore) && all.findIndex((x) => x.valore === t.valore) === i)
        .map((t) => ({ code: t.valore, name: t.label, required: null, firstSeenAt: nowIso }));
      if (added.length > 0) {
        repo.updateConfig(db, config.id, { pendingCourses: [...config.pendingCourses, ...added] });
        for (const t of added) {
          repo.addLog(db, {
            configId: config.id,
            level: "info",
            kind: "new_course",
            message: `Nuovo insegnamento disponibile: ${t.name} (${t.code}) – da approvare`,
          });
        }
      }
    }
  }
  repo.setState(db, CATALOG_REFRESH_STATE, nowIso);
  logger.info({ years: years.map((y) => y.value), newYear: newYear?.value ?? null }, "catalogo aggiornato");
  return { newYear };
}
