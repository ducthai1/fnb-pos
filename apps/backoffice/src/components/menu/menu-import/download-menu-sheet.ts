import type { Category, ProductSummary } from "../../../lib/api/catalog-api";
import { menuSheetRows } from "../../../lib/catalog/menu-sheet/menu-sheet-export";
import { writeXlsxSheet } from "../../../lib/sheet/write-xlsx-sheet";
import { vi } from "../../../messages/vi";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Today on this computer's calendar, for the file name ("2026-10-21"). */
const localDay = (now: Date) =>
  [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((part) => String(part).padStart(2, "0"))
    .join("-");

/** Hands the person the whole menu, taken-off products included, as a products sheet. */
export function downloadMenuSheet(
  products: readonly ProductSummary[],
  categories: readonly Category[],
  now: Date = new Date(),
): void {
  const bytes = writeXlsxSheet(vi.menuImport.sheetName, menuSheetRows(products, categories));
  // A copy on a plain ArrayBuffer: Blob does not take a view that may sit on shared memory.
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: XLSX_TYPE }));
  const link = document.createElement("a");
  link.href = url;
  link.download = vi.menuImport.exportFile(localDay(now));
  document.body.append(link);
  link.click();
  link.remove();
  // The download has its own copy once started; a later revoke frees the memory.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
