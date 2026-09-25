import type { TeachingGroup } from "@/lib/easystaff/courses";
import { suggestExercises, type LetterSuggestion } from "@/lib/easystaff/letters";

export function suggestionFor(groups: TeachingGroup[], initial: string): LetterSuggestion {
  return suggestExercises(groups, initial);
}
