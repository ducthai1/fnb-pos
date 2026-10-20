import type { ReactNode } from "react";

export interface TableColumn {
  readonly label: string;
  /** Amounts and counts line up on the right on a computer. */
  readonly numeric?: boolean;
}

export interface TableRow {
  readonly key: string;
  readonly cells: readonly ReactNode[];
  /** Data attributes a test or a spec finds the row by. */
  readonly data?: Readonly<Record<`data-${string}`, string>>;
}

/**
 * A read-only table: columns on a computer, one block per row on a phone with each cell
 * labelled by its column (the shared .bo-table rules). Nothing but text goes in a cell
 * here, so long names wrap inside it instead of widening the page.
 */
export function SimpleTable({
  caption,
  columns,
  rows,
  empty,
}: {
  caption: string;
  columns: readonly TableColumn[];
  rows: readonly TableRow[];
  empty: string;
}) {
  if (rows.length === 0) return <p className="bo-muted">{empty}</p>;
  return (
    <table className="bo-table">
      <caption className="bo-table__caption">{caption}</caption>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.label} scope="col" className={column.numeric === true ? "bo-num" : undefined}>
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} {...row.data}>
            {row.cells.map((cell, index) => (
              <td
                key={columns[index]?.label ?? index}
                data-label={columns[index]?.label}
                className={columns[index]?.numeric === true ? "bo-num" : undefined}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
