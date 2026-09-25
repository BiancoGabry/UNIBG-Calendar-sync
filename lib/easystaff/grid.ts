// grid_call.php: the lessons. Same call the portal's js/schedule/schedule.js (loadGrid) makes.
import { formatInTimeZone } from "date-fns-tz";
import { EasyStaffClient, EasyStaffError } from "./http";
import { gridResponseSchema, type GridResponse } from "./schemas";
import { TZ } from "./time";

export type GridRequest = {
  aa: string; // academic year start, "2026"
  course: string; // "21-R"
  curricula: { value: string; label: string }[]; // anno2[] values + txtcurr labels
  date: Date | string; // Date, or "dd-mm-yyyy"
  allEvents?: boolean; // default true: whole teaching period(s) in one call
};

export function formatGridDate(date: Date | string): string {
  return typeof date === "string" ? date : formatInTimeZone(date, TZ, "dd-MM-yyyy");
}

/**
 * Builds the form body in the order the browser sends it. The browser sends
 * `txtcurr` and `all_events` twice (portal JS artefact); PHP keeps the last value,
 * so each is sent once here with the final value.
 */
export function buildGridForm(req: GridRequest): URLSearchParams {
  if (req.curricula.length === 0) throw new Error("Serve almeno un anno/percorso (anno2[])");
  const form = new URLSearchParams();
  form.append("view", "easycourse");
  form.append("form-type", "corso");
  form.append("include", "corso");
  form.append("anno", req.aa);
  form.append("scuola", "");
  form.append("corso", req.course);
  for (const c of req.curricula) form.append("anno2[]", c.value);
  form.append("visualizzazione_orario", "cal");
  form.append("date", formatGridDate(req.date));
  form.append("periodo_didattico", "");
  form.append("_lang", "it");
  form.append("list", "");
  form.append("week_grid_type", "-1");
  form.append("ar_codes_", "");
  form.append("ar_select_", "");
  form.append("col_cells", "0");
  form.append("empty_box", "0");
  form.append("only_grid", "0");
  form.append("highlighted_date", "0");
  form.append("all_events", req.allEvents === false ? "0" : "1");
  form.append("faculty_group", "0");
  // With several curricula the value does not affect the data (verified with curl).
  form.append("txtcurr", req.curricula[0].label);
  return form;
}

export function parseGridResponse(text: string): GridResponse {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new EasyStaffError("parse", `grid_call.php: JSON non valido (${(err as Error).message})`);
  }
  const parsed = gridResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new EasyStaffError(
      "validation",
      "grid_call.php: risposta con struttura inattesa",
      parsed.error.issues.slice(0, 20),
    );
  }
  return parsed.data;
}

export async function fetchGrid(client: EasyStaffClient, req: GridRequest): Promise<GridResponse> {
  const text = await client.postForm("grid_call.php", buildGridForm(req));
  return parseGridResponse(text);
}

/** Public portal link to the timetable of one teaching. */
export function teachingPortalUrl(baseUrl: string, aa: string, code: string): string {
  const url = new URL("index.php", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  url.search = new URLSearchParams({
    view: "easycourse",
    include: "attivita",
    anno: aa,
    "attivita[]": code,
    _lang: "it",
  }).toString();
  return url.toString();
}
