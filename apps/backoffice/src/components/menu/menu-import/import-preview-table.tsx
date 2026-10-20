"use client";

import { formatVnd, vnd } from "@fnb/domain";
import { FileSpreadsheet } from "lucide-react";
import type { Category, ProductSummary } from "../../../lib/api/catalog-api";
import { vi } from "../../../messages/vi";
import { type DataColumn, type DataFilter, DataTable } from "../../ui/data-table";
import { EmptyState } from "../../ui/empty-state";
import type { ImportRow, ImportStatus } from "./plan-menu-import";
import type { RowOutcome } from "./run-menu-import";

const T = vi.menuImport;
const TONE: Readonly<Record<ImportStatus, string | undefined>> = {
  new: "info",
  update: "warn",
  same: undefined,
  skipped: undefined,
  error: "danger",
};

interface Shown {
  readonly row: ImportRow;
  readonly outcome: RowOutcome | undefined;
}

function changesOf(row: ImportRow, products: readonly ProductSummary[]): string[] {
  const current = products.find((product) => product.id === row.productId);
  if (row.status !== "update" || current === undefined) return [];
  const changes: string[] = [];
  if (current.basePrice !== row.price && row.price !== null)
    changes.push(T.changes.price(formatVnd(vnd(row.price))));
  if (!("id" in row.category) || row.category.id !== current.categoryId)
    changes.push(T.changes.category);
  return changes;
}

function StatusCell({ shown, products }: { shown: Shown; products: readonly ProductSummary[] }) {
  const { row, outcome } = shown;
  if (outcome !== undefined) {
    return (
      <div className="bo-import-status">
        <span className="bo-badge" data-tone={outcome.ok ? "ok" : "danger"}>
          {outcome.ok ? T.status.imported : T.status.failed}
        </span>
        {!outcome.ok && <span className="bo-import-status__why bo-wrap">{outcome.message}</span>}
      </div>
    );
  }
  const notes = [...row.problems, ...changesOf(row, products)];
  return (
    <div className="bo-import-status">
      <span className="bo-badge" data-tone={TONE[row.status]}>
        {T.status[row.status]}
      </span>
      {notes.map((note) => (
        <span key={note} className="bo-import-status__why bo-wrap">
          {note}
        </span>
      ))}
    </div>
  );
}

const STATUSES: readonly ImportStatus[] = ["new", "update", "same", "skipped", "error"];

/** Every line of the file with what importing it does, or did, filterable by that. */
export function ImportPreviewTable({
  rows,
  outcomes,
  products,
  categories,
}: {
  rows: readonly ImportRow[];
  outcomes: ReadonlyMap<number, RowOutcome>;
  products: readonly ProductSummary[];
  categories: readonly Category[];
}) {
  const shown: Shown[] = rows.map((row) => ({ row, outcome: outcomes.get(row.line) }));
  const categoryLabel = ({ row }: Shown) => {
    if ("create" in row.category) return T.newCategory(row.category.create);
    const id = row.category.id;
    return categories.find((category) => category.id === id)?.name ?? T.noCategory;
  };
  const columns: readonly DataColumn<Shown>[] = [
    {
      key: "name",
      label: T.columns.name,
      cell: ({ row }) => <span className="bo-wrap">{row.name || "—"}</span>,
      sortValue: ({ row }) => row.name,
    },
    {
      key: "line",
      label: T.columns.line,
      numeric: true,
      width: "72px",
      cell: ({ row }) => row.line,
      sortValue: ({ row }) => row.line,
    },
    {
      key: "code",
      label: T.columns.code,
      width: "14%",
      cell: ({ row }) => <span className="bo-wrap">{row.code || "—"}</span>,
    },
    {
      key: "category",
      label: T.columns.category,
      width: "18%",
      cell: (item) => <span className="bo-wrap">{categoryLabel(item)}</span>,
    },
    {
      key: "price",
      label: T.columns.price,
      numeric: true,
      width: "14%",
      cell: ({ row }) => (row.price === null ? "—" : formatVnd(vnd(row.price))),
      sortValue: ({ row }) => row.price,
    },
    {
      key: "status",
      label: T.columns.status,
      width: "26%",
      cell: (item) => <StatusCell shown={item} products={products} />,
    },
  ];
  const filters: DataFilter<Shown>[] = STATUSES.filter((status) =>
    rows.some((row) => row.status === status),
  ).map((status) => ({
    key: status,
    label: T.filters[status],
    test: ({ row }) => row.status === status,
  }));
  return (
    <DataTable
      label={T.previewLabel}
      rows={shown}
      rowKey={({ row }) => String(row.line)}
      rowData={({ row, outcome }) => ({
        "data-import-line": String(row.line),
        "data-import-status":
          outcome === undefined ? row.status : outcome.ok ? "imported" : "failed",
      })}
      columns={columns}
      search={{ label: T.search, text: ({ row }) => `${row.name} ${row.code}` }}
      filters={filters}
      empty={<EmptyState icon={FileSpreadsheet}>{T.noMatch}</EmptyState>}
    />
  );
}
