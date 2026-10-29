import type { ReactNode } from "react";
import { matchesSearch } from "../../lib/format/search-text";

export interface ListboxChoice {
  readonly value: string;
  readonly label: string;
  /** Drawn before the label in the list, such as the swatch of a look. */
  readonly lead?: ReactNode;
}

/** A list longer than this gets a search box unless the caller says otherwise. */
export const SEARCH_FROM_CHOICES = 8;

/** The choice a key moves to from `at` in a list of `count`, or null for a key that does not move. */
export function stepFor(key: string, at: number, count: number): number | null {
  if (count === 0) return null;
  if (key === "ArrowDown") return Math.min(at + 1, count - 1);
  if (key === "ArrowUp") return Math.max(at - 1, 0);
  if (key === "Home" || key === "PageUp") return 0;
  if (key === "End" || key === "PageDown") return count - 1;
  return null;
}

/** The first choice after `at` whose label starts with what was typed, wrapping; -1 if none. */
export function matchTyped(choices: readonly ListboxChoice[], typed: string, at: number): number {
  const wanted = typed.toLocaleLowerCase("vi");
  for (let step = 1; step <= choices.length; step += 1) {
    const index = (at + step) % choices.length;
    if (choices[index]?.label.toLocaleLowerCase("vi").startsWith(wanted)) return index;
  }
  return -1;
}

/** The choices whose label holds what was typed, ignoring tone marks, đ and case. */
export function filterChoices(choices: readonly ListboxChoice[], typed: string): readonly ListboxChoice[] {
  return typed.trim() === "" ? choices : choices.filter((choice) => matchesSearch(choice.label, typed));
}
