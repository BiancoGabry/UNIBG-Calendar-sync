// Text cleanup for EasyStaff strings: double-encoded UTF-8 ("mojibake") and inline HTML.

// Windows-1252 characters that occupy the 0x80-0x9F byte range. A UTF-8 byte in that
// range, decoded as cp1252, shows up as one of these instead of a C1 control char.
const CP1252_TO_BYTE: Record<string, number> = {
  "€": 0x80,
  "‚": 0x82,
  ƒ: 0x83,
  "„": 0x84,
  "…": 0x85,
  "†": 0x86,
  "‡": 0x87,
  ˆ: 0x88,
  "‰": 0x89,
  Š: 0x8a,
  "‹": 0x8b,
  Œ: 0x8c,
  Ž: 0x8e,
  "‘": 0x91,
  "’": 0x92,
  "“": 0x93,
  "”": 0x94,
  "•": 0x95,
  "–": 0x96,
  "—": 0x97,
  "˜": 0x98,
  "™": 0x99,
  š: 0x9a,
  "›": 0x9b,
  œ: 0x9c,
  ž: 0x9e,
  Ÿ: 0x9f,
};

const CONT = "[\\u0080-\\u00BF€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]";
// A UTF-8 lead byte followed by the right number of continuation bytes, all read as latin1/cp1252.
const MOJIBAKE_SEQ = new RegExp(
  `[\\u00C2-\\u00DF]${CONT}|[\\u00E0-\\u00EF]${CONT}{2}|[\\u00F0-\\u00F4]${CONT}{3}`,
  "g",
);

const utf8 = new TextDecoder("utf-8", { fatal: true });

function toByte(ch: string): number | null {
  const code = ch.charCodeAt(0);
  if (code <= 0xff) return code;
  return CP1252_TO_BYTE[ch] ?? null;
}

/**
 * Re-decodes UTF-8 sequences that were wrongly decoded as latin1/cp1252,
 * e.g. "SOSTENIBILITÃ\u0080" → "SOSTENIBILITÀ". Correct text is left untouched:
 * only sequences that form valid UTF-8 are replaced.
 */
export function fixMojibake(input: string): string {
  let current = input;
  // Text can be double-encoded more than once: repeat while something changes.
  for (let i = 0; i < 3; i++) {
    const next = current.replace(MOJIBAKE_SEQ, (seq) => {
      const bytes: number[] = [];
      for (const ch of seq) {
        const b = toByte(ch);
        if (b === null) return seq;
        bytes.push(b);
      }
      try {
        return utf8.decode(Uint8Array.from(bytes));
      } catch {
        return seq;
      }
    });
    if (next === current) break;
    current = next;
  }
  return current;
}

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  agrave: "à",
  aacute: "á",
  egrave: "è",
  eacute: "é",
  igrave: "ì",
  iacute: "í",
  ograve: "ò",
  oacute: "ó",
  ugrave: "ù",
  uacute: "ú",
  Agrave: "À",
  Aacute: "Á",
  Egrave: "È",
  Eacute: "É",
  Igrave: "Ì",
  Iacute: "Í",
  Ograve: "Ò",
  Oacute: "Ó",
  Ugrave: "Ù",
  Uacute: "Ú",
  ccedil: "ç",
  Ccedil: "Ç",
  ntilde: "ñ",
  Ntilde: "Ñ",
  ouml: "ö",
  uuml: "ü",
  auml: "ä",
  laquo: "«",
  raquo: "»",
  euro: "€",
  deg: "°",
  ndash: "–",
  mdash: "—",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  hellip: "…",
};

export function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body] ?? match;
  });
}

/**
 * Converts an HTML fragment to plain text. `<br>` and `<hr>` become line breaks,
 * tags are dropped, entities decoded, whitespace collapsed. Mojibake is fixed too.
 */
export function htmlToText(input: string | null | undefined): string {
  if (!input) return "";
  const text = decodeEntities(
    fixMojibake(input)
      .replace(/<\s*(br|hr)\b[^>]*>/gi, "\n")
      .replace(/<\/\s*(p|div|li)\s*>/gi, "\n")
      .replace(/<[^>]*>/g, ""),
  );
  return text
    .split("\n")
    .map((line) => line.replace(/[\s ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/** Plain text on one line: line breaks become a single space. */
export function htmlToLine(input: string | null | undefined): string {
  return htmlToText(input).replace(/\n+/g, " ").trim();
}

/** Splits HTML on `<hr>` separators, returning each part as clean one-line text. */
export function splitOnHr(input: string | null | undefined): string[] {
  if (!input) return [];
  return input
    .split(/<\s*hr\b[^>]*>/i)
    .map((part) => htmlToLine(part))
    .filter(Boolean);
}
