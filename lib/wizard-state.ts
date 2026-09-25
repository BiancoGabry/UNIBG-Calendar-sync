import "server-only";
import type { WizardState } from "@/components/wizard/types";
import { getDb } from "@/lib/db/client";
import * as repo from "@/lib/db/repo";
import type { AcademicYear } from "@/lib/easystaff/combo";
import { getAcademicYears } from "@/lib/easystaff/service";
import { DEFAULT_EVENT_OPTIONS } from "@/lib/sync/event";

export async function loadYears(): Promise<{ years: AcademicYear[]; error: string | null }> {
  try {
    return { years: await getAcademicYears(getDb()), error: null };
  } catch (err) {
    return { years: [], error: (err as Error).message };
  }
}

export function emptyWizardState(years: AcademicYear[]): WizardState {
  const latest = years[0];
  return {
    id: null,
    aa: latest?.value ?? String(new Date().getFullYear()),
    aaLabel: latest?.label ?? "",
    school: "",
    courseCode: "",
    courseLabel: "",
    curricula: [],
    selected: [],
    surnameInitial: "",
    calendarId: null,
    calendarName: null,
    calendarColor: null,
    options: DEFAULT_EVENT_OPTIONS,
    status: "draft",
  };
}

export function wizardStateFromConfig(id: string) {
  const db = getDb();
  const c = repo.getConfig(db, id);
  if (!c) return null;
  const state: WizardState = {
    id: c.id,
    aa: c.aa,
    aaLabel: c.aaLabel,
    school: "",
    courseCode: c.courseCode,
    courseLabel: c.courseLabel,
    curricula: c.curricula,
    selected: c.selectedCourses,
    surnameInitial: c.surnameInitial,
    calendarId: c.calendarId,
    calendarName: c.calendarName,
    calendarColor: c.calendarColor,
    options: c.options,
    status: c.status,
  };
  return { state, excluded: c.excludedCourses, hasEvents: repo.loadSnapshot(db, id).length > 0 };
}
