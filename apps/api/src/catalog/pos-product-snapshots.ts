import type { PosProductWire } from "@fnb/contracts";
import type pg from "pg";
import { productImageUrl } from "../media/product-image-store";
import type { Unversioned } from "./pos-menu-snapshots";
import { amountOf } from "./product-document";
import { readProductArrangements } from "./read-product-arrangement";

interface ProductRow {
  id: string;
  tenant_id: string;
  image_key: string | null;
  brand_id: string;
  category_id: string | null;
  station_id: string | null;
  kind: PosProductWire["kind"];
  name: string;
  base_price: string | null;
  pricing_mode: PosProductWire["pricingMode"];
  measure_unit: NonNullable<PosProductWire["measureUnit"]> | null;
  tax_rate_bp: number;
  track_stock: boolean;
  earns_points: boolean;
  print_cup_label: boolean;
}

/** A brand's whole menu, or the named products wherever they belong. */
export type ProductScope = { brandId: string } | { productIds: readonly string[] };

/**
 * Live products as a till sells them, without the copy's version (the caller stamps it).
 * An archived product is not on any till's menu, so it is simply not returned; the feed
 * tells tills it is gone with a null copy. kind and pricing_mode hold only what their CHECK
 * constraints allow, and the domain checked the whole document when it was saved.
 */
export async function readPosProducts(
  client: pg.PoolClient,
  scope: ProductScope,
): Promise<Unversioned<PosProductWire>[]> {
  const byBrand = "brandId" in scope;
  const products = await client.query<ProductRow>(
    "SELECT id, brand_id, category_id, station_id, kind, name, base_price, pricing_mode, " +
      "measure_unit, " +
      "tax_rate_bp, track_stock, earns_points, print_cup_label, tenant_id, image_key FROM product " +
      `WHERE ${byBrand ? "brand_id = $1" : "id = ANY($1::uuid[])"} AND archived_at IS NULL ` +
      "ORDER BY name, id",
    [byBrand ? scope.brandId : scope.productIds],
  );
  const ids = products.rows.map((row) => row.id);
  const variants = await client.query<{
    id: string;
    product_id: string;
    name: string;
    price: string | null;
  }>(
    "SELECT id, product_id, name, price FROM product_variant " +
      "WHERE product_id = ANY($1::uuid[]) AND archived_at IS NULL ORDER BY sort_order, id",
    [ids],
  );
  const arrangements = await readProductArrangements(client, ids);
  return products.rows.map((row) => {
    const arrangement = arrangements.get(row.id);
    return {
      id: row.id,
      brandId: row.brand_id,
      categoryId: row.category_id,
      stationId: row.station_id,
      kind: row.kind,
      name: row.name,
      basePrice: row.base_price === null ? null : amountOf(row.base_price),
      pricingMode: row.pricing_mode,
      measureUnit: row.measure_unit,
      taxRate: row.tax_rate_bp,
      trackStock: row.track_stock,
      earnsPoints: row.earns_points,
      printCupLabel: row.print_cup_label,
      // Left out without a photo: a till that predates photos reads every such copy.
      ...(row.image_key === null ? {} : { imageUrl: productImageUrl(row.tenant_id, row.image_key) }),
      variants: variants.rows
        .filter((variant) => variant.product_id === row.id)
        .map((variant) => ({
          id: variant.id,
          name: variant.name,
          price: variant.price === null ? null : amountOf(variant.price),
        })),
      modifierGroups: arrangement?.modifierGroups ?? [],
      combo: row.kind === "combo" ? { slots: arrangement?.slots ?? [] } : null,
    };
  });
}
