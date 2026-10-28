import {
  type BasisPoints,
  type MeasureUnit,
  type PriceListItem,
  type PriceListScope,
  type Product,
  type ProductKind,
  type PricingMode,
  type RoundingMode,
  basisPoints,
  vnd,
} from "@fnb/domain";
import type pg from "pg";
import type { ProductDocument } from "../catalog/product-document";
import { readProductDocument } from "../catalog/read-product-document";
import { CommandRejection, SYNC_ERROR_CODES } from "./sync-error-codes";

export interface BranchPricing {
  readonly branchId: string;
  readonly brandId: string;
  readonly utcOffsetMinutes: number;
  /** When the business day starts, in minutes of the local day: 240 puts 03:00 in the night before. */
  readonly businessDayStartMinute: number;
}

export interface SellableProduct {
  readonly product: Product;
  readonly taxRate: BasisPoints;
}

export async function readBranchPricing(
  client: pg.PoolClient,
  branchId: string,
): Promise<BranchPricing> {
  const { rows } = await client.query<{
    brand_id: string;
    utc_offset_minutes: number;
    business_day_start_minute: number;
  }>("SELECT brand_id, utc_offset_minutes, business_day_start_minute FROM branch WHERE id = $1", [
    branchId,
  ]);
  const row = rows[0];
  if (row === undefined) throw new Error(`branch ${branchId} of an authenticated till is missing`);
  return {
    branchId,
    brandId: row.brand_id,
    utcOffsetMinutes: row.utc_offset_minutes,
    businessDayStartMinute: row.business_day_start_minute,
  };
}

/**
 * The products a draft sells, as the domain prices them, read in the command's transaction.
 * A product of another brand or one taken off the menu is not for sale here.
 */
export async function loadSellableProducts(
  client: pg.PoolClient,
  brandId: string,
  productIds: readonly string[],
): Promise<Map<string, SellableProduct>> {
  const found = new Map<string, SellableProduct>();
  for (const id of new Set(productIds)) {
    const document = await readProductDocument(client, id);
    if (document === null || document.brandId !== brandId || document.archivedAt !== null) {
      throw new CommandRejection(SYNC_ERROR_CODES.productNotFound);
    }
    found.set(id, { product: productOf(document), taxRate: basisPoints(document.taxRateBp) });
  }
  return found;
}

// kind, pricing_mode and measure_unit hold only the values their CHECK constraints allow,
// and the document was checked by the domain when it was saved.
function productOf(document: ProductDocument): Product {
  return {
    id: document.id,
    categoryId: document.categoryId,
    kind: document.kind as ProductKind,
    name: document.name,
    basePrice: document.basePrice === null ? null : vnd(document.basePrice),
    pricingMode: document.pricingMode as PricingMode,
    measureUnit: document.measureUnit as MeasureUnit | null,
    variants: document.variants.map((variant) => ({
      ...variant,
      price: variant.price === null ? null : vnd(variant.price),
    })),
    modifierGroups: document.modifierGroups.map((group) => ({
      ...group,
      options: group.options.map((option) => ({ ...option, priceDelta: vnd(option.priceDelta) })),
    })),
    combo:
      document.combo === null
        ? null
        : {
            slots: document.combo.slots.map((slot) => ({
              ...slot,
              options: slot.options.map((option) => ({
                ...option,
                upcharge: vnd(option.upcharge),
              })),
            })),
          },
  };
}

interface PriceListItemRow {
  id: string;
  scope_kind: string;
  scope_id: string | null;
  branch_id: string | null;
  channel_key: string | null;
  valid_from: Date | null;
  valid_to: Date | null;
  days_of_week: number[] | null;
  start_minute: number | null;
  end_minute: number | null;
  effect_kind: string;
  fixed_price: string | null;
  percent_off_bp: number | null;
  rounding: string | null;
  priority: number;
}

/** Every price list item of the brand; which one applies is the domain's choice. */
export async function loadBrandPriceList(
  client: pg.PoolClient,
  brandId: string,
): Promise<PriceListItem[]> {
  const { rows } = await client.query<PriceListItemRow>(
    "SELECT i.* FROM price_list_item i JOIN price_list l ON l.id = i.price_list_id " +
      "WHERE l.brand_id = $1 ORDER BY i.id",
    [brandId],
  );
  return rows.map((row) => ({
    id: row.id,
    scope: scopeOf(row.scope_kind, row.scope_id ?? ""),
    branchId: row.branch_id,
    channelKey: row.channel_key,
    validFrom: row.valid_from?.getTime() ?? null,
    validTo: row.valid_to?.getTime() ?? null,
    daysOfWeek: row.days_of_week,
    timeWindow:
      row.start_minute === null || row.end_minute === null
        ? null
        : { startMinute: row.start_minute, endMinute: row.end_minute },
    effect:
      row.effect_kind === "fixed_price"
        ? { kind: "fixed_price", price: vnd(BigInt(row.fixed_price ?? "0")) }
        : {
            kind: "percent_off",
            rate: basisPoints(row.percent_off_bp ?? 0),
            rounding: row.rounding as RoundingMode,
          },
    priority: row.priority,
  }));
}

// The scope columns are kept consistent by the price list CHECK constraints.
function scopeOf(kind: string, scopeId: string): PriceListScope {
  if (kind === "variant") return { kind, variantId: scopeId };
  if (kind === "product") return { kind, productId: scopeId };
  if (kind === "category") return { kind, categoryId: scopeId };
  return { kind: "global" };
}
