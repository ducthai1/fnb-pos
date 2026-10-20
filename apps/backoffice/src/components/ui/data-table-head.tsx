"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { vi } from "../../messages/vi";
import type { DataColumn, Sort } from "./data-table";
import { Icon } from "./icon";

const T = vi.table;

/** The head row: each column's name, as a sort button when it sorts. */
export function DataTableHead<R>({
  columns,
  sort,
  onSort,
  actionsWidth,
  hasActions,
}: {
  columns: readonly DataColumn<R>[];
  sort: Sort | null;
  onSort: (key: string) => void;
  actionsWidth: string | undefined;
  hasActions: boolean;
}) {
  return (
    <thead>
      <tr>
        {columns.map((column) => {
          const sorted = sort?.key === column.key ? sort.direction : null;
          return (
            <th
              key={column.key}
              scope="col"
              className={column.numeric === true ? "bo-num" : undefined}
              style={column.width === undefined ? undefined : { width: column.width }}
              aria-sort={
                sorted === null ? undefined : sorted === "asc" ? "ascending" : "descending"
              }
            >
              {column.sortValue === undefined ? (
                column.label
              ) : (
                <button
                  type="button"
                  className="bo-sort"
                  aria-label={T.sortColumn(column.label)}
                  onClick={() => onSort(column.key)}
                >
                  {column.label}
                  <Icon
                    of={sorted === null ? ArrowUpDown : sorted === "asc" ? ArrowUp : ArrowDown}
                    size={14}
                  />
                </button>
              )}
            </th>
          );
        })}
        {hasActions && (
          <th scope="col" style={actionsWidth === undefined ? undefined : { width: actionsWidth }}>
            {T.actions}
          </th>
        )}
      </tr>
    </thead>
  );
}
