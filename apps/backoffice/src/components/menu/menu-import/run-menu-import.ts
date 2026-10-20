import type { CatalogApi, Category } from "../../../lib/api/catalog-api";
import type { ProductBody, ProductDocument } from "../../../lib/catalog/product-document";
import { failureMessage } from "../../../lib/errors/failure-message";
import { vi } from "../../../messages/vi";
import { newId } from "../product-editor/product-draft";
import { type ImportRow, nameKey, rowsToWrite } from "./plan-menu-import";

const T = vi.menuImport;
const SORT_STEP = 10;

export type RowOutcome = { readonly ok: true } | { readonly ok: false; readonly message: string };

/** The body that saves a document back unchanged; the import then sets what it changes. */
export function bodyOfDocument(document: ProductDocument): ProductBody {
  return {
    version: document.version,
    brandId: document.brandId,
    categoryId: document.categoryId,
    kind: document.kind,
    name: document.name,
    basePrice: document.basePrice,
    pricingMode: document.pricingMode,
    taxRateBp: document.taxRateBp,
    stationId: document.stationId,
    trackStock: document.trackStock,
    earnsPoints: document.earnsPoints,
    printCupLabel: document.printCupLabel,
    variants: document.variants,
    modifierGroups: document.modifierGroups,
    combo: document.combo,
  };
}

/** Creates each missing category once, after the last one of the menu; the id of each name. */
async function createCategories(
  api: CatalogApi,
  brandId: string,
  rows: readonly ImportRow[],
  categories: readonly Category[],
): Promise<Map<string, string | RowOutcome>> {
  const created = new Map<string, string | RowOutcome>();
  let sortOrder = Math.max(0, ...categories.map((category) => category.sortOrder));
  for (const row of rows) {
    if (!("create" in row.category)) continue;
    const key = nameKey(row.category.create);
    if (created.has(key)) continue;
    sortOrder += SORT_STEP;
    const answer = await api.putCategory(newId(), {
      version: null,
      brandId,
      name: row.category.create,
      sortOrder,
    });
    created.set(
      key,
      answer.ok ? answer.value.id : { ok: false, message: T.categoryFailed(row.category.create) },
    );
  }
  return created;
}

async function writeRow(
  api: CatalogApi,
  row: ImportRow,
  categoryId: string | null,
): Promise<RowOutcome> {
  if (row.status === "new" && row.body !== null) {
    const saved = await api.putProduct(newId(), { ...row.body, categoryId });
    return saved.ok ? { ok: true } : { ok: false, message: failureMessage(saved) };
  }
  if (row.productId === null) return { ok: false, message: T.status.failed };
  // The whole product is read again just before it is saved, so its version is current
  // and every part the sheet does not carry (sizes, options, station) stays as it was.
  const current = await api.getProduct(row.productId);
  if (!current.ok) return { ok: false, message: failureMessage(current) };
  const body = { ...bodyOfDocument(current.value), basePrice: row.price, categoryId };
  const saved = await api.putProduct(row.productId, body);
  return saved.ok ? { ok: true } : { ok: false, message: failureMessage(saved) };
}

/**
 * Writes the new and changed lines one product at a time through the catalog routes the
 * editor uses, telling each line's outcome as it lands. `stopped` is asked before every
 * product, so a stop leaves the menu with whole products only; what was written stays,
 * and importing the file again carries on, since written lines now match by name.
 */
export async function runMenuImport(
  api: CatalogApi,
  input: {
    readonly brandId: string;
    readonly rows: readonly ImportRow[];
    readonly categories: readonly Category[];
  },
  hooks: {
    readonly stopped: () => boolean;
    readonly onRow: (line: number, outcome: RowOutcome) => void;
  },
): Promise<"done" | "stopped"> {
  const rows = rowsToWrite(input.rows);
  const created = await createCategories(api, input.brandId, rows, input.categories);
  for (const row of rows) {
    if (hooks.stopped()) return "stopped";
    let categoryId: string | null;
    if ("create" in row.category) {
      const made = created.get(nameKey(row.category.create));
      if (typeof made !== "string") {
        hooks.onRow(row.line, made ?? { ok: false, message: T.status.failed });
        continue;
      }
      categoryId = made;
    } else categoryId = row.category.id;
    hooks.onRow(row.line, await writeRow(api, row, categoryId));
  }
  return "done";
}
