import type { Category } from "../api/catalog-api";

/** Room between neighbours, so a category can later be slotted in without renumbering. */
export const SORT_STEP = 10;

export interface CategoryWrite {
  readonly category: Category;
  readonly sortOrder: number;
}

/** The categories in the order the menu shows them: by position, then by name. */
export const inMenuOrder = (categories: readonly Category[]): Category[] =>
  [...categories].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "vi"));

/**
 * The writes that move the category at `index` (in menu order) one place up (-1) or down
 * (+1): the list is numbered again by steps of ten, and only the categories whose number
 * changes are written. Nothing to write when it is already at that end.
 */
export function moveCategory(categories: readonly Category[], index: number, direction: -1 | 1): CategoryWrite[] {
  const ordered = inMenuOrder(categories);
  const target = index + direction;
  if (index < 0 || index >= ordered.length || target < 0 || target >= ordered.length) return [];
  const moved = [...ordered];
  const [category] = moved.splice(index, 1);
  moved.splice(target, 0, category!);
  return moved
    .map((each, position) => ({ category: each, sortOrder: (position + 1) * SORT_STEP }))
    .filter((write) => write.sortOrder !== write.category.sortOrder);
}
