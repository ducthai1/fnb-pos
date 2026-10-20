"use client";

import { ShoppingBag } from "lucide-react";
import type { DailySalesReport } from "../../lib/api/reports-api";
import { quantityText, vndText } from "../../lib/format/business-day";
import { vi } from "../../messages/vi";
import { type DataColumn, DataTable } from "../ui/data-table";
import { EmptyState } from "../ui/empty-state";

const T = vi.dailySales;
const I = T.itemColumns;

type Item = DailySalesReport["items"][number] & { readonly row: number };

const itemName = (item: Item) =>
  T.lineTypes[item.lineType] === undefined ? item.name : `${item.name} (${T.lineTypes[item.lineType]})`;

const money = (key: "gross" | "discount" | "net" | "tax", label: string): DataColumn<Item> => ({
  key,
  label,
  numeric: true,
  cell: (item) => vndText(item[key]),
  sortValue: (item) => item[key],
});

const COLUMNS: readonly DataColumn<Item>[] = [
  { key: "name", label: I.name, cell: itemName, sortValue: itemName, width: "32%" },
  { key: "quantity", label: I.quantity, numeric: true, cell: (item) => quantityText(item.quantity), sortValue: (item) => Number(item.quantity) },
  money("gross", I.gross),
  money("discount", I.discount),
  money("net", I.net),
  money("tax", I.tax),
];

/**
 * What was sold, line type by line type as the report lists it: searchable, sortable by
 * any figure, toppings and combo parts apart from the goods. The figures are the report's.
 */
export function DailyItemsTable({ report }: { report: DailySalesReport }) {
  const rows = report.items.map((item, row) => ({ ...item, row }));
  return (
    <DataTable
      label={T.itemsTitle}
      rows={rows}
      rowKey={(item) => String(item.row)}
      columns={COLUMNS}
      search={{ label: T.itemsSearch, text: itemName }}
      filters={[
        { key: "goods", label: T.itemFilters.goods, test: (item) => item.lineType === "item" },
        { key: "extras", label: T.itemFilters.extras, test: (item) => item.lineType !== "item" },
      ]}
      empty={<EmptyState icon={ShoppingBag}>{T.empty}</EmptyState>}
    />
  );
}
