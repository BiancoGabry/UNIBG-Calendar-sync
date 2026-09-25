// Surname letter groups of exercise sessions ("stud. A-L", "M-Z", ...). Pure, browser-safe.
import type { TeachingGroup } from "./courses";

export type LetterRange = { from: string; to: string };

/**
 * Parses the surname range of an exercise group from its name:
 * "(stud. A-L)", "(stud. lett M-Z)", "(stud A-M)", "(stud. lett P-Z)", "N-Z".
 */
export function parseLetterRange(name: string): LetterRange | null {
  const candidates = [...name.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]);
  // Prefer parentheses that mention students/letters, then any parentheses, then the whole name.
  candidates.sort((a, b) => Number(/stud|lett/i.test(b)) - Number(/stud|lett/i.test(a)));
  for (const text of [...candidates, name]) {
    const m = text.match(/(?:^|[^A-Za-z])([A-Za-z])\s*-\s*([A-Za-z])(?![A-Za-z])/);
    if (m) {
      const from = m[1].toUpperCase();
      const to = m[2].toUpperCase();
      if (from <= to) return { from, to };
    }
  }
  return null;
}

export function letterInRange(letter: string, range: LetterRange): boolean {
  const l = letter.toUpperCase();
  return l >= range.from && l <= range.to;
}

export type LetterSuggestion = {
  selected: Set<string>; // exercise codes matching the initial
  ambiguous: string[]; // group keys with more than one compatible exercise group
  unknown: string[]; // group keys with exercises but no parsable letter range
};

/** Suggests exercise groups for a surname initial. Only a suggestion: the UI keeps it editable. */
export function suggestExercises(groups: TeachingGroup[], initial: string): LetterSuggestion {
  const letter = initial.trim().charAt(0).toUpperCase();
  const result: LetterSuggestion = { selected: new Set(), ambiguous: [], unknown: [] };
  if (!/^[A-Z]$/.test(letter)) return result;
  for (const g of groups) {
    if (g.exercises.length === 0) continue;
    const ranged = g.exercises.filter((e) => e.letterRange);
    if (ranged.length === 0) {
      result.unknown.push(g.key);
      continue;
    }
    const matches = ranged.filter((e) => letterInRange(letter, e.letterRange!));
    for (const e of matches) result.selected.add(e.code);
    if (matches.length > 1) result.ambiguous.push(g.key);
  }
  return result;
}
