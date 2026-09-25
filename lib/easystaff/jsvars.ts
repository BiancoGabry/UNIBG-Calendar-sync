// Parser for the JavaScript payloads returned by combo.php:
//   var elenco_corsi = [...];var elenco_cdl = elenco_corsi;var elenco_scuole = [...];
// Each `var <name> = <JSON literal>;` is extracted and JSON.parse'd. Aliases
// (`var a = b;`) are skipped. No eval, no vm.

const VAR_RE = /(?:^|;)\s*var\s+([A-Za-z_$][\w$]*)\s*=\s*/g;
const IDENTIFIER_RE = /^[A-Za-z_$][\w$.]*$/;

export class JsVarsParseError extends Error {
  constructor(
    message: string,
    readonly variable?: string,
  ) {
    super(message);
    this.name = "JsVarsParseError";
  }
}

export function parseJsVars(source: string): Record<string, unknown> {
  const hits: { name: string; start: number; bodyStart: number }[] = [];
  for (const m of source.matchAll(VAR_RE)) {
    hits.push({ name: m[1], start: m.index, bodyStart: m.index + m[0].length });
  }
  if (hits.length === 0) throw new JsVarsParseError("Nessuna dichiarazione `var` trovata");

  const out: Record<string, unknown> = {};
  hits.forEach((hit, i) => {
    const end = i + 1 < hits.length ? hits[i + 1].start : source.length;
    const body = source.slice(hit.bodyStart, end).trim().replace(/;\s*$/, "").trim();
    if (IDENTIFIER_RE.test(body)) return; // alias, e.g. `var elenco_cdl = elenco_corsi;`
    try {
      out[hit.name] = JSON.parse(body);
    } catch (err) {
      throw new JsVarsParseError(`JSON non valido in \`var ${hit.name}\`: ${(err as Error).message}`, hit.name);
    }
  });
  return out;
}
