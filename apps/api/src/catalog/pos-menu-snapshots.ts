import type {
  PosAvailabilityWire,
  PosCategoryWire,
  PosPriceListWire,
  PosStationWire,
} from "@fnb/contracts";
import type pg from "pg";
import { type PriceListItemRow, priceListItemWireOf } from "./pos-price-list-item";

/** A till's copy before it is stamped with the feed position it was taken at. */
export type Unversioned<T> = Omit<T, "version">;

/** Every row of an owner (brand, branch), or the rows named. */
type RowScope = { ownerId: string } | { ids: readonly string[] };

const whereOf = (scope: RowScope, ownerColumn: string): [string, unknown] =>
  "ownerId" in scope ? [`${ownerColumn} = $1`, scope.ownerId] : ["id = ANY($1::uuid[])", scope.ids];

export async function readPosCategories(
  client: pg.PoolClient,
  scope: RowScope,
): Promise<Unversioned<PosCategoryWire>[]> {
  const [where, value] = whereOf(scope, "brand_id");
  const { rows } = await client.query(
    `SELECT id, brand_id, name, sort_order FROM category WHERE ${where} ORDER BY sort_order, name, id`,
    [value],
  );
  return rows.map((row) => ({
    id: row.id,
    brandId: row.brand_id,
    name: row.name,
    sortOrder: row.sort_order,
  }));
}

export async function readPosStations(
  client: pg.PoolClient,
  scope: RowScope,
): Promise<Unversioned<PosStationWire>[]> {
  const [where, value] = whereOf(scope, "branch_id");
  const { rows } = await client.query(
    `SELECT id, branch_id, name FROM station WHERE ${where} ORDER BY name, id`,
    [value],
  );
  return rows.map((row) => ({ id: row.id, branchId: row.branch_id, name: row.name }));
}

/**
 * The brand's price lists (or the ones named) as one branch sees them: items for every
 * branch and for this one. Another branch's items are left out, since a till applies the
 * copy as it is and has no reason to hold rules that can never apply to it.
 */
export async function readPosPriceLists(
  client: pg.PoolClient,
  branchId: string,
  scope: RowScope,
): Promise<Unversioned<PosPriceListWire>[]> {
  const [where, value] = whereOf(scope, "brand_id");
  const lists = await client.query(
    `SELECT id, brand_id, name FROM price_list WHERE ${where} ORDER BY name, id`,
    [value],
  );
  const items = await client.query<PriceListItemRow>(
    "SELECT * FROM price_list_item WHERE price_list_id = ANY($1::uuid[]) " +
      "AND (branch_id IS NULL OR branch_id = $2) ORDER BY id",
    [lists.rows.map((list) => list.id), branchId],
  );
  return lists.rows.map((list) => ({
    id: list.id,
    brandId: list.brand_id,
    name: list.name,
    items: items.rows.filter((item) => item.price_list_id === list.id).map(priceListItemWireOf),
  }));
}

/**
 * What is sold out at the branch right now, by product: entries already past their end no
 * longer count. With `productIds`, those products only, an empty list for one on sale.
 */
export async function readPosAvailability(
  client: pg.PoolClient,
  branchId: string,
  now: Date,
  productIds?: readonly string[],
): Promise<Unversioned<PosAvailabilityWire>[]> {
  const { rows } = await client.query<{
    product_id: string;
    channel_key: string | null;
    unavailable_until: Date | null;
  }>(
    "SELECT product_id, channel_key, unavailable_until FROM product_availability " +
      "WHERE branch_id = $1 AND (unavailable_until IS NULL OR unavailable_until > $2) " +
      "AND ($3::uuid[] IS NULL OR product_id = ANY($3::uuid[])) " +
      "ORDER BY product_id, channel_key NULLS FIRST",
    [branchId, now, productIds ?? null],
  );
  const ids = productIds ?? [...new Set(rows.map((row) => row.product_id))];
  return ids.map((productId) => ({
    productId,
    entries: rows
      .filter((row) => row.product_id === productId)
      .map((row) => ({
        channelKey: row.channel_key,
        unavailableUntil: row.unavailable_until?.toISOString() ?? null,
      })),
  }));
}
