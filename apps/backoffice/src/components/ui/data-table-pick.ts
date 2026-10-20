import type { DataSelection } from "./data-table";

/**
 * Ticking rows of a table: one at a time, or all the rows shown at once, so a search or
 * a filter narrows what "all" picks. Nothing to do when the table has no selection.
 */
export function pickTools<R>(
  selection: DataSelection<R> | undefined,
  shownKeys: readonly string[],
) {
  const allPicked =
    shownKeys.length > 0 && shownKeys.every((key) => selection?.picked.has(key) === true);
  const pickAll = (on: boolean) => {
    if (selection === undefined) return;
    const next = new Set(selection.picked);
    for (const key of shownKeys) {
      if (on) next.add(key);
      else next.delete(key);
    }
    selection.onPick(next);
  };
  const pickOne = (key: string) => {
    if (selection === undefined) return;
    const next = new Set(selection.picked);
    if (!next.delete(key)) next.add(key);
    selection.onPick(next);
  };
  return { allPicked, pickAll, pickOne };
}
