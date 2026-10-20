"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Fragment, type ReactNode, useId, useState } from "react";
import { type SortDirection, type SortValue, tableView } from "../../lib/table/table-view";
import { vi } from "../../messages/vi";
import { Icon } from "./icon";
import { TableToolbar } from "./table-toolbar";

const T = vi.table;

export interface DataColumn<R> {
  readonly key: string;
  readonly label: string;
  readonly numeric?: boolean;
  readonly cell: (row: R) => ReactNode;
  /** What the column sorts by; a column without it does not sort. */
  readonly sortValue?: (row: R) => SortValue;
}

export interface DataFilter<R> {
  readonly key: string;
  readonly label: string;
  readonly test: (row: R) => boolean;
}

export interface Sort {
  readonly key: string;
  readonly direction: SortDirection;
}

/**
 * A list of records as a table on a computer and one card per row on a phone, with the
 * same tools everywhere: a search box, filters as segments with their counts, a sort by
 * any sortable column (its header on a computer, a select on a phone), the row's actions
 * in the last column, an optional panel under a row, and its own "nothing" states.
 */
export function DataTable<R>(props: {
  label: string;
  rows: readonly R[];
  rowKey: (row: R) => string;
  rowData?: (row: R) => Readonly<Record<`data-${string}`, string>>;
  columns: readonly DataColumn<R>[];
  search?: { readonly label: string; readonly text: (row: R) => string };
  filters?: readonly DataFilter<R>[];
  actions?: (row: R) => ReactNode;
  expanded?: (row: R) => ReactNode;
  panelData?: (row: R) => Readonly<Record<`data-${string}`, string>>;
  empty: ReactNode;
  initialSort?: Sort;
}) {
  const {
    label,
    rows,
    rowKey,
    rowData,
    columns,
    search,
    filters = [],
    actions,
    expanded,
    panelData,
    empty,
  } = props;
  const [typed, setTyped] = useState("");
  const [filterKey, setFilterKey] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort | null>(props.initialSort ?? null);
  const id = useId();

  if (rows.length === 0) return <div className="bo-empty">{empty}</div>;
  const filter = filters.find((candidate) => candidate.key === filterKey);
  const sortColumn = columns.find(
    (column) => column.key === sort?.key && column.sortValue !== undefined,
  );
  const shown = tableView(rows, {
    typed,
    ...(search === undefined ? {} : { searchText: search.text }),
    ...(filter === undefined ? {} : { keep: filter.test }),
    ...(sortColumn?.sortValue === undefined
      ? {}
      : { sortValue: sortColumn.sortValue, direction: sort?.direction ?? "asc" }),
  });
  const width = columns.length + (actions === undefined ? 0 : 1);
  const toggleSort = (key: string) =>
    setSort((current) =>
      current?.key !== key
        ? { key, direction: "asc" }
        : current.direction === "asc"
          ? { key, direction: "desc" }
          : null,
    );

  return (
    <div className="bo-data">
      <TableToolbar
        id={id}
        search={search === undefined ? undefined : { label: search.label, typed, onType: setTyped }}
        filters={filters.map((candidate) => ({
          key: candidate.key,
          label: candidate.label,
          count: rows.filter(candidate.test).length,
        }))}
        total={rows.length}
        filterKey={filterKey}
        onFilter={setFilterKey}
        sortable={columns
          .filter((column) => column.sortValue !== undefined)
          .map((column) => ({ key: column.key, label: column.label }))}
        sort={sort}
        onSort={setSort}
        shown={shown.length}
      />
      {shown.length === 0 ? (
        <p className="bo-empty">{T.noMatch}</p>
      ) : (
        <table className="bo-table bo-data__table" aria-label={label}>
          <thead>
            <tr>
              {columns.map((column) => {
                const sorted = sort?.key === column.key ? sort.direction : null;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    className={column.numeric === true ? "bo-num" : undefined}
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
                        onClick={() => toggleSort(column.key)}
                      >
                        {column.label}
                        <Icon
                          of={
                            sorted === null ? ArrowUpDown : sorted === "asc" ? ArrowUp : ArrowDown
                          }
                          size={14}
                        />
                      </button>
                    )}
                  </th>
                );
              })}
              {actions !== undefined && <th scope="col">{T.actions}</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => {
              const panel = expanded?.(row);
              return (
                <Fragment key={rowKey(row)}>
                  <tr {...rowData?.(row)}>
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        data-label={column.label}
                        className={column.numeric === true ? "bo-num bo-wrap" : "bo-wrap"}
                      >
                        {column.cell(row)}
                      </td>
                    ))}
                    {actions !== undefined && <td className="bo-data__actions">{actions(row)}</td>}
                  </tr>
                  {panel !== undefined && panel !== null && (
                    <tr className="bo-data__panel" {...panelData?.(row)}>
                      <td colSpan={width}>{panel}</td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
