import type pg from "pg";
import { productImageUrl } from "../media/product-image-store";
import { type ProductDocument, amountOf } from "./product-document";
import { readProductArrangement } from "./read-product-arrangement";

interface ProductRow {
  id: string;
  tenant_id: string;
  image_key: string | null;
  version: number;
  archived_at: Date | null;
  brand_id: string;
  category_id: string | null;
  kind: string;
  name: string;
  base_price: string | null;
  pricing_mode: string;
  measure_unit: string | null;
  tax_rate_bp: number;
  station_id: string | null;
  track_stock: boolean;
  earns_points: boolean;
  print_cup_label: boolean;
  code: string;
}

/** The product with its live variants and options, or null when this tenant has none by that id. */
export async function readProductDocument(
  client: pg.PoolClient,
  id: string,
): Promise<ProductDocument | null> {
  const found = await client.query<ProductRow>("SELECT * FROM product WHERE id = $1", [id]);
  const row = found.rows[0];
  if (row === undefined) return null;
  const variants = await client.query<{ id: string; name: string; price: string | null }>(
    "SELECT id, name, price FROM product_variant WHERE product_id = $1 AND archived_at IS NULL " +
      "ORDER BY sort_order, id",
    [id],
  );
  const arrangement = await readProductArrangement(client, id);
  return {
    id: row.id,
    version: row.version,
    archivedAt: row.archived_at === null ? null : row.archived_at.toISOString(),
    brandId: row.brand_id,
    categoryId: row.category_id,
    kind: row.kind,
    name: row.name,
    basePrice: row.base_price === null ? null : amountOf(row.base_price),
    pricingMode: row.pricing_mode,
    measureUnit: row.measure_unit,
    taxRateBp: row.tax_rate_bp,
    stationId: row.station_id,
    trackStock: row.track_stock,
    earnsPoints: row.earns_points,
    printCupLabel: row.print_cup_label,
    code: row.code,
    imageKey: row.image_key,
    imageUrl: row.image_key === null ? null : productImageUrl(row.tenant_id, row.image_key),
    variants: variants.rows.map((variant) => ({
      id: variant.id,
      name: variant.name,
      price: variant.price === null ? null : amountOf(variant.price),
    })),
    modifierGroups: arrangement.modifierGroups,
    combo: row.kind === "combo" ? { slots: arrangement.slots } : null,
  };
}
