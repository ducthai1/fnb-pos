import type { Category, ProductSummary } from "../../../lib/api/catalog-api";
import { menuSheetRows } from "../../../lib/catalog/menu-sheet/menu-sheet-export";
import { type SheetCell, writeXlsxSheet } from "../../../lib/sheet/write-xlsx-sheet";
import { vi } from "../../../messages/vi";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Today on this computer's calendar, for the file name ("2026-10-21"). */
const localDay = (now: Date) =>
  [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((part) => String(part).padStart(2, "0"))
    .join("-");

function downloadSheet(rows: readonly (readonly SheetCell[])[], fileName: string): void {
  const bytes = writeXlsxSheet(vi.menuImport.sheetName, rows);
  // A copy on a plain ArrayBuffer: Blob does not take a view that may sit on shared memory.
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: XLSX_TYPE }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // The download has its own copy once started; a later revoke frees the memory.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Hands the person the whole menu, taken-off products included, as a products sheet. */
export function downloadMenuSheet(
  products: readonly ProductSummary[],
  categories: readonly Category[],
  now: Date = new Date(),
): void {
  downloadSheet(menuSheetRows(products, categories), vi.menuImport.exportFile(localDay(now)));
}

/** A sheet to fill in by hand: the same columns, with a few lines showing how. */
export function downloadMenuTemplate(): void {
  const groups = [...new Set(vi.menuImport.templateLines.map(([, group]) => group))];
  const categories: Category[] = groups.map((name, at) => ({
    id: `group-${at}`,
    brandId: "",
    name,
    sortOrder: at,
    version: 1,
  }));
  const products: ProductSummary[] = vi.menuImport.templateLines.map(
    ([name, group, price], at) => ({
      id: `line-${at}`,
      name,
      kind: "prepared_drink",
      categoryId: `group-${groups.indexOf(group)}`,
      basePrice: price,
      pricingMode: "fixed",
      version: 1,
      archivedAt: null,
    }),
  );
  downloadSheet(menuSheetRows(products, categories), vi.menuImport.templateFile);
}
