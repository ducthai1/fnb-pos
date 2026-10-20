import type { Category, ProductSummary } from "../../api/catalog-api";
import type { SheetCell } from "../../sheet/write-xlsx-sheet";
import { MENU_SHEET_HEADER, headerKey } from "./read-menu-sheet";

const column = (title: string) => MENU_SHEET_HEADER.findIndex((header) => headerKey(header) === headerKey(title));
const NAME = column("Tên hàng hóa");
const GROUP = column("Tên nhóm");
const PRICE = column("Giá bán");
const NOT_FOR_SALE = column("Không cho phép bán?");

/**
 * The menu as the rows of a products sheet: header first, then one row per product in the
 * menu's category order and by name. A product with no fixed price leaves "Giá bán" blank;
 * one taken off the menu is marked "Không cho phép bán?" so importing it again skips it.
 */
export function menuSheetRows(
  products: readonly ProductSummary[],
  categories: readonly Category[],
): SheetCell[][] {
  const order = new Map(
    [...categories].sort((a, b) => a.sortOrder - b.sortOrder).map((category, at) => [category.id, at]),
  );
  const rank = (product: ProductSummary) =>
    product.categoryId === null ? categories.length : (order.get(product.categoryId) ?? categories.length);
  const sorted = [...products].sort(
    (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "vi"),
  );
  const rows = sorted.map((product) => {
    const row: SheetCell[] = MENU_SHEET_HEADER.map(() => null);
    row[NAME] = product.name;
    row[GROUP] = categories.find((category) => category.id === product.categoryId)?.name ?? null;
    row[PRICE] = product.pricingMode === "fixed" ? product.basePrice : null;
    row[NOT_FOR_SALE] = product.archivedAt === null ? 0 : 1;
    return row;
  });
  return [[...MENU_SHEET_HEADER], ...rows];
}
