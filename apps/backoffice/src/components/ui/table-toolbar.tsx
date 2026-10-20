"use client";

import { Search, X } from "lucide-react";
import type { Sort } from "./data-table";
import { vi } from "../../messages/vi";
import { Icon } from "./icon";

const T = vi.table;

interface Choice {
  readonly key: string;
  readonly label: string;
}

/**
 * The tools over a table: search with a clear button, the filters as segments that say
 * how many rows each keeps, a sort select (the headers sort on a computer; on a phone,
 * where headers are not shown, this does) and how many rows are shown.
 */
export function TableToolbar({
  id,
  search,
  filters,
  total,
  filterKey,
  onFilter,
  sortable,
  sort,
  onSort,
  shown,
}: {
  id: string;
  search: { label: string; typed: string; onType: (typed: string) => void } | undefined;
  filters: readonly (Choice & { count: number })[];
  total: number;
  filterKey: string | null;
  onFilter: (key: string | null) => void;
  sortable: readonly Choice[];
  sort: Sort | null;
  onSort: (sort: Sort | null) => void;
  shown: number;
}) {
  const sortText = sort === null ? "" : `${sort.key}:${sort.direction}`;
  return (
    <div className="bo-data__tools">
      {search !== undefined && (
        <label className="bo-search">
          <Icon of={Search} />
          <span className="bo-sr-only">{search.label}</span>
          <input
            className="bo-search__input"
            type="search"
            value={search.typed}
            placeholder={search.label}
            onChange={(event) => search.onType(event.target.value)}
          />
          {search.typed !== "" && (
            <button
              type="button"
              className="bo-search__clear"
              aria-label={T.clearSearch}
              onClick={() => search.onType("")}
            >
              <Icon of={X} size={16} />
            </button>
          )}
        </label>
      )}
      {filters.length > 0 && (
        <div className="bo-tabs" role="group" aria-label={T.filter}>
          {[{ key: null, label: T.all, count: total }, ...filters].map((choice) => (
            <button
              key={choice.key ?? "all"}
              type="button"
              className="bo-tab"
              aria-pressed={filterKey === choice.key}
              onClick={() => onFilter(choice.key)}
            >
              {T.count(choice.label, choice.count)}
            </button>
          ))}
        </div>
      )}
      {sortable.length > 0 && (
        <label className="bo-data__sort">
          <span className="bo-sr-only">{T.sortBy}</span>
          <select
            id={`${id}-sort`}
            className="bo-input"
            value={sortText}
            onChange={(event) => {
              const [key, direction] = event.target.value.split(":");
              onSort(
                key === undefined || key === ""
                  ? null
                  : { key, direction: direction === "desc" ? "desc" : "asc" },
              );
            }}
          >
            <option value="">{`${T.sortBy}: ${T.sortNone}`}</option>
            {sortable.flatMap((column) =>
              [true, false].map((ascending) => (
                <option
                  key={`${column.key}${ascending}`}
                  value={`${column.key}:${ascending ? "asc" : "desc"}`}
                >
                  {`${T.sortBy}: ${T.sortOption(column.label, ascending)}`}
                </option>
              )),
            )}
          </select>
        </label>
      )}
      <p className="bo-data__count" aria-live="polite">
        {T.shown(shown, total)}
      </p>
    </div>
  );
}
