import { matchesSearch } from "../format/search-text";

export type SortDirection = "asc" | "desc";
export type SortValue = string | number | null;

export interface TableQuery<R> {
  /** What was typed in the search box, matched against `searchText` (tone marks ignored). */
  readonly typed?: string;
  readonly searchText?: (row: R) => string;
  /** The picked filter's test; none keeps every row. */
  readonly keep?: (row: R) => boolean;
  readonly sortValue?: (row: R) => SortValue;
  readonly direction?: SortDirection;
}

const collator = new Intl.Collator("vi", { numeric: true, sensitivity: "base" });

/** Numbers by size, words the way Vietnamese sort them; a row with no value goes last either way. */
function compare(a: SortValue, b: SortValue, direction: SortDirection): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  const order =
    typeof a === "number" && typeof b === "number" ? a - b : collator.compare(String(a), String(b));
  return direction === "asc" ? order : -order;
}

/**
 * The rows a table shows: filtered, then searched, then sorted. The sort is stable, so
 * rows that tie keep the order the server gave them.
 */
export function tableView<R>(rows: readonly R[], query: TableQuery<R>): R[] {
  const { typed = "", searchText, keep, sortValue, direction = "asc" } = query;
  const shown = rows.filter(
    (row) =>
      (keep === undefined || keep(row)) &&
      (searchText === undefined || matchesSearch(searchText(row), typed)),
  );
  if (sortValue === undefined) return shown;
  return shown
    .map((row, index) => ({ row, index, value: sortValue(row) }))
    .sort((a, b) => compare(a.value, b.value, direction) || a.index - b.index)
    .map(({ row }) => row);
}
