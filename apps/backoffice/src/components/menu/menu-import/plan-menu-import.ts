import type { Category, ProductSummary } from "../../../lib/api/catalog-api";
import type { MenuSheetRow } from "../../../lib/catalog/menu-sheet/read-menu-sheet";
import type { ProductBody } from "../../../lib/catalog/product-document";
import { vi } from "../../../messages/vi";
import { checkProductDraft } from "../product-editor/check-product-draft";
import { emptyDraft } from "../product-editor/product-draft";

const T = vi.menuImport;
/** The catalog's longest name, for a category as for a product. */
const NAME_MAX = 120;

export type ImportStatus = "new" | "update" | "same" | "skipped" | "error";
/** Where an imported product goes: a category that exists (or none), or one to create. */
export type RowCategory = { readonly id: string | null } | { readonly create: string };
export type CategoryTarget =
  { readonly by: "group" } | { readonly by: "one"; readonly id: string | null };

export interface ImportRow {
  readonly line: number;
  readonly code: string;
  readonly name: string;
  readonly price: number | null;
  readonly category: RowCategory;
  readonly status: ImportStatus;
  readonly problems: readonly string[];
  /** The product of the menu this line updates or matches, by name. */
  readonly productId: string | null;
  /** The checked body of a new product, its category still to be set. */
  readonly body: ProductBody | null;
}

/** Names as the person reads them: case, spacing and Unicode form do not make two products. */
export const nameKey = (name: string): string =>
  name.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("vi");

function categoryOf(
  row: MenuSheetRow,
  target: CategoryTarget,
  categories: readonly Category[],
): RowCategory {
  if (target.by === "one") return { id: target.id };
  const group = row.group.trim().replace(/\s+/g, " ");
  if (group === "") return { id: null };
  const existing = categories.find((category) => nameKey(category.name) === nameKey(group));
  return existing === undefined ? { create: group } : { id: existing.id };
}

/**
 * What importing each line would do, judged before anything is written: the name and
 * price by the product editor's own check (the contract's shape, then the domain's rules),
 * then lines that repeat a code or a name, then a match with the menu by name, since a
 * product has no code here, a product on sale winning over one taken off the menu. A
 * matched product is updated only when its price or its category would change, so
 * importing the same file twice writes nothing the second time; its category changes only
 * by a "Tên nhóm" the line names, never because the line names none or a category was
 * picked for new products.
 */
export function planMenuImport(input: {
  readonly rows: readonly MenuSheetRow[];
  readonly products: readonly ProductSummary[];
  readonly categories: readonly Category[];
  readonly brandId: string;
  readonly kind: ProductBody["kind"];
  readonly target: CategoryTarget;
}): ImportRow[] {
  const byName = new Map<string, ProductSummary>();
  for (const product of input.products) {
    const key = nameKey(product.name);
    if (!byName.has(key) || product.archivedAt === null) byName.set(key, product);
  }
  const codeLine = new Map<string, number>();
  const nameLine = new Map<string, number>();
  return input.rows.map((row) => {
    const category = categoryOf(row, input.target, input.categories);
    const draft = {
      ...emptyDraft("00000000-0000-7000-8000-000000000000", input.brandId),
      kind: input.kind,
      name: row.name,
      basePrice: row.price,
      taxRate: row.vat === "" ? "0" : row.vat.replace(/%$/, ""),
    };
    const check = checkProductDraft(draft);
    const problems = check.ok ? [] : [...new Set(Object.values(check.errors))];
    if ("create" in category && category.create.length > NAME_MAX) problems.push(T.groupTooLong);
    const firstCode = row.code === "" ? undefined : codeLine.get(row.code);
    if (firstCode !== undefined) problems.push(T.duplicateCode(firstCode));
    else if (row.code !== "") codeLine.set(row.code, row.line);
    const key = nameKey(row.name);
    const firstName = key === "" ? undefined : nameLine.get(key);
    if (firstName !== undefined) problems.push(T.duplicateName(firstName));
    else if (key !== "") nameLine.set(key, row.line);

    const price = check.ok ? check.body.basePrice : null;
    const match = byName.get(key) ?? null;
    const base = {
      line: row.line,
      code: row.code,
      name: row.name.trim(),
      price,
      category,
      problems,
    };
    const productId = match?.id ?? null;
    if (problems.length > 0) return { ...base, status: "error", productId, body: null };
    if (row.notForSale)
      return { ...base, status: "skipped", problems: [T.notForSale], productId, body: null };
    if (match === null)
      return { ...base, status: "new", productId, body: check.ok ? check.body : null };
    if (match.archivedAt !== null) {
      return { ...base, status: "skipped", problems: [T.archivedMatch], productId, body: null };
    }
    if (match.pricingMode !== "fixed") {
      return { ...base, status: "skipped", problems: [T.notFixedPrice], productId, body: null };
    }
    const keeps = input.target.by === "one" || row.group.trim() === "";
    const moved: RowCategory = keeps ? { id: match.categoryId } : category;
    const same = match.basePrice === price && "id" in moved && moved.id === match.categoryId;
    return { ...base, category: moved, status: same ? "same" : "update", productId, body: null };
  });
}

/** The lines an import writes, in the file's order. */
export const rowsToWrite = (rows: readonly ImportRow[]): ImportRow[] =>
  rows.filter((row) => row.status === "new" || row.status === "update");
