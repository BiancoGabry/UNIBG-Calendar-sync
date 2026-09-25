import type { CSSProperties } from "react";

// Distinct hues, assigned in order of course code so colours are stable across views.
const HUES = [212, 145, 25, 280, 350, 190, 45, 100, 320, 250, 0, 165, 60, 230];

export function courseHues(codes: string[]): Map<string, number> {
  return new Map([...new Set(codes)].sort().map((c, i) => [c, HUES[i % HUES.length]]));
}

/** Inline CSS variable consumed by the `lesson-chip` classes below. */
export function hueStyle(hue: number | undefined): CSSProperties {
  return { ["--hue" as string]: String(hue ?? 212) };
}

export const chipClass =
  "bg-[hsl(var(--hue)_80%_93%)] border-l-[hsl(var(--hue)_65%_42%)] text-[hsl(var(--hue)_45%_18%)] " +
  "dark:bg-[hsl(var(--hue)_35%_22%)] dark:border-l-[hsl(var(--hue)_60%_60%)] dark:text-[hsl(var(--hue)_40%_92%)]";

export const dotClass = "bg-[hsl(var(--hue)_65%_48%)]";
