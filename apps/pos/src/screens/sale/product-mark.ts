import { initialOf } from "../shared/staff-avatar";

/** How many colours the menu's categories cycle through; 0 is the neutral one. */
export const CATEGORY_TONES = 8;

/**
 * What a tile shows where a photo would be: the first letter of the first two words, whole
 * ("Cà phê sữa" → "CP", an emoji stays one emoji). Drawn by CSS, so it never joins the name.
 */
export function productMark(name: string): string {
  const words = name
    .trim()
    .split(/\s+/u)
    .filter((word) => word !== "");
  if (words.length === 0) return "?";
  return words.slice(0, 2).map(initialOf).join("");
}

/** Each category keeps its colour by its place on the menu; a product without one is neutral. */
export function categoryTones(categories: readonly { id: string }[]): ReadonlyMap<string, number> {
  return new Map(categories.map((category, index) => [category.id, (index % CATEGORY_TONES) + 1]));
}
