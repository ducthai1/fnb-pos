"use client";

import { Fragment, type ReactNode, useId, useRef, useState } from "react";
import { type SortDirection, type SortValue, tableView } from "../../lib/table/table-view";
import { vi } from "../../messages/vi";
import { DataTableHead } from "./data-table-head";
import { pickTools } from "./data-table-pick";
import { PAGE_SIZES, TablePager, pageOf } from "./table-pager";
import { TableToolbar } from "./table-toolbar";

const T = vi.table;

export interface DataColumn<R> {
  readonly key: string;
  readonly label: string;
  readonly numeric?: boolean;
  readonly cell: (row: R) => ReactNode;
  /** What the column sorts by; a column without it does not sort. */
  readonly sortValue?: (row: R) => SortValue;
  /** Its share of a computer's width ("30%", "120px"); the columns without one share the rest. */
  readonly width?: string;
}

export interface DataFilter<R> {
  readonly key: string;
  readonly label: string;
  readonly test: (row: R) => boolean;
}

/** Rows a person ticks to act on them together; the ids are the rows' keys. */
export interface DataSelection<R> {
  readonly picked: ReadonlySet<string>;
  readonly onPick: (picked: ReadonlySet<string>) => void;
  /** The name of a row's checkbox ("Chọn Bạc xỉu"). */
  readonly label: (row: R) => string;
  /** The name of the head's checkbox, which ticks every row shown. */
  readonly allLabel: string;
}

export interface Sort {
  readonly key: string;
  readonly direction: SortDirection;
}

/** From this many columns a table needs the full width: a wide screen keeps its filter as a
    row over it instead of a card beside it. */
const WIDE_TABLE = 6;

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
  /** What the filters sort rows by, the title of their card on a wide screen. */
  filterLabel?: string;
  actions?: (row: R) => ReactNode;
  /** The actions column's width on a computer, for rows with several buttons. */
  actionsWidth?: string;
  expanded?: (row: R) => ReactNode;
  panelData?: (row: R) => Readonly<Record<`data-${string}`, string>>;
  empty: ReactNode;
  initialSort?: Sort;
  selection?: DataSelection<R>;
}) {
  const {
    label,
    rows,
    rowKey,
    rowData,
    columns,
    search,
    filters = [],
    filterLabel,
    actions,
    actionsWidth,
    expanded,
    panelData,
    empty,
    selection,
  } = props;
  const [typed, setTypedNow] = useState("");
  const [filterKey, setFilterKeyNow] = useState<string | null>(null);
  const [sort, setSortNow] = useState<Sort | null>(props.initialSort ?? null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0]);
  const id = useId();
  const frame = useRef<HTMLDivElement>(null);
  // A new search, filter or order starts again from the first page.
  const setTyped = (text: string) => {
    setTypedNow(text);
    setPage(1);
  };
  const setFilterKey = (key: string | null) => {
    setFilterKeyNow(key);
    setPage(1);
  };
  const setSort = (next: Sort | null | ((current: Sort | null) => Sort | null)) => {
    setSortNow(next);
    setPage(1);
  };

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
  const onPage = pageOf(shown, page, pageSize);
  const { allPicked, pickAll, pickOne } = pickTools(selection, shown.map(rowKey));
  const toggleSort = (key: string) =>
    setSort((current) =>
      current?.key !== key
        ? { key, direction: "asc" }
        : current.direction === "asc"
          ? { key, direction: "desc" }
          : null,
    );

  return (
    <div ref={frame} className="bo-data" data-wide={width >= WIDE_TABLE ? "" : undefined}>
      <TableToolbar
        id={id}
        search={search === undefined ? undefined : { label: search.label, typed, onType: setTyped }}
        filters={filters.map((candidate) => ({
          key: candidate.key,
          label: candidate.label,
          count: rows.filter(candidate.test).length,
        }))}
        total={rows.length}
        filterLabel={filterLabel}
        filterKey={filterKey}
        onFilter={setFilterKey}
        sortable={columns
          .filter((column) => column.sortValue !== undefined)
          .map((column) => ({ key: column.key, label: column.label }))}
        sort={sort}
        onSort={setSort}
        shown={shown.length}
      />
      {selection !== undefined && shown.length > 0 && (
        <label className="bo-field--inline bo-data__pick-all">
          <input type="checkbox" checked={allPicked} onChange={() => pickAll(!allPicked)} />
          {selection.allLabel}
        </label>
      )}
      {shown.length === 0 ? (
        <p className="bo-empty">{T.noMatch}</p>
      ) : (
        <table className="bo-table bo-data__table" aria-label={label}>
          <DataTableHead
            columns={columns}
            sort={sort}
            onSort={toggleSort}
            actionsWidth={actionsWidth}
            hasActions={actions !== undefined}
          />
          <tbody>
            {onPage.rows.map((row) => {
              const panel = expanded?.(row);
              return (
                <Fragment key={rowKey(row)}>
                  <tr {...rowData?.(row)}>
                    {columns.map((column, at) => (
                      <td
                        key={column.key}
                        data-label={column.label}
                        className={column.numeric === true ? "bo-num bo-wrap" : "bo-wrap"}
                      >
                        {at === 0 && selection !== undefined ? (
                          <div className="bo-data__pick">
                            <input
                              type="checkbox"
                              aria-label={selection.label(row)}
                              checked={selection.picked.has(rowKey(row))}
                              onChange={() => pickOne(rowKey(row))}
                            />
                            {column.cell(row)}
                          </div>
                        ) : (
                          column.cell(row)
                        )}
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
      <TablePager
        page={onPage.page}
        size={pageSize}
        total={shown.length}
        onPage={(next) => {
          setPage(next);
          // The new page is read from its top, not from where the last one ended.
          frame.current?.scrollIntoView?.({ block: "start" });
        }}
        onSize={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />
    </div>
  );
}
