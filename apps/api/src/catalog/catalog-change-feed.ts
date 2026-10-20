import { POS_FEED_ENTITY } from "@fnb/contracts";
import type pg from "pg";
import { appendSequencedChange } from "../sync/change-feed";
import {
  readPosAvailability,
  readPosCategories,
  readPosPriceLists,
  readPosStations,
} from "./pos-menu-snapshots";
import { readPosProducts } from "./pos-product-snapshots";

/*
 * Menu changes in the till feed. The feed is read by branch, and a brand's menu is sold at
 * all its branches, so a brand-level change is written once per branch of the brand. That
 * keeps the till's pull a single index range per branch, and it lets a copy differ by branch
 * where the branch matters (price items for one branch only, sold-out state). Every branch
 * of the brand gets it, with or without a paired till: a till paired later bootstraps from
 * the menu as it is, and skipping branches without tills would race a pairing in flight.
 * Every function here runs in the writer's transaction, after lockTenantChangeFeed.
 */

async function branchesOfBrand(client: pg.PoolClient, brandId: string): Promise<string[]> {
  const { rows } = await client.query<{ id: string }>(
    "SELECT id FROM branch WHERE brand_id = $1 ORDER BY id",
    [brandId],
  );
  return rows.map((row) => row.id);
}

/** Products the given groups are attached to; a group edited through one changes them all. */
export async function productsSharingGroups(
  client: pg.PoolClient,
  groupIds: readonly string[],
): Promise<string[]> {
  const { rows } = await client.query<{ product_id: string }>(
    "SELECT DISTINCT product_id FROM product_modifier_group " +
      "WHERE modifier_group_id = ANY($1::uuid[]) ORDER BY product_id",
    [groupIds],
  );
  return rows.map((row) => row.product_id);
}

/** The products' copies now, by id; an archived product has none. */
export async function productCopies(client: pg.PoolClient, productIds: readonly string[]) {
  const copies = await readPosProducts(client, { productIds });
  return new Map(copies.map((copy) => [copy.id, copy]));
}

/** Sends each product's copy (null once archived) to every branch of its own brand. */
export async function recordProductChanges(
  client: pg.PoolClient,
  tenantId: string,
  productIds: readonly string[],
): Promise<void> {
  const { rows } = await client.query<{ id: string; brand_id: string }>(
    "SELECT id, brand_id FROM product WHERE id = ANY($1::uuid[]) ORDER BY id",
    [productIds],
  );
  const copies = await productCopies(client, productIds);
  for (const row of rows) {
    for (const branchId of await branchesOfBrand(client, row.brand_id)) {
      await appendSequencedChange(client, tenantId, {
        branchId,
        entity: POS_FEED_ENTITY.product,
        entityId: row.id,
        snapshot: copies.get(row.id) ?? null,
      });
    }
  }
}

/** A category saved or deleted (null copy) for every branch of its brand. */
export async function recordCategoryChange(
  client: pg.PoolClient,
  tenantId: string,
  brandId: string,
  categoryId: string,
): Promise<void> {
  const [copy] = await readPosCategories(client, { ids: [categoryId] });
  for (const branchId of await branchesOfBrand(client, brandId)) {
    await appendSequencedChange(client, tenantId, {
      branchId,
      entity: POS_FEED_ENTITY.category,
      entityId: categoryId,
      snapshot: copy ?? null,
    });
  }
}

/** A station belongs to one branch, so only that branch's tills hear of it. */
export async function recordStationChange(
  client: pg.PoolClient,
  tenantId: string,
  branchId: string,
  stationId: string,
): Promise<void> {
  const [copy] = await readPosStations(client, { ids: [stationId] });
  await appendSequencedChange(client, tenantId, {
    branchId,
    entity: POS_FEED_ENTITY.station,
    entityId: stationId,
    snapshot: copy ?? null,
  });
}

/** A price list as each branch of its brand sees it: its own items and the shared ones. */
export async function recordPriceListChange(
  client: pg.PoolClient,
  tenantId: string,
  brandId: string,
  priceListId: string,
): Promise<void> {
  for (const branchId of await branchesOfBrand(client, brandId)) {
    const [copy] = await readPosPriceLists(client, branchId, { ids: [priceListId] });
    await appendSequencedChange(client, tenantId, {
      branchId,
      entity: POS_FEED_ENTITY.priceList,
      entityId: priceListId,
      snapshot: copy ?? null,
    });
  }
}

/** What is sold out of one product at one branch, as of `now`, to that branch's tills. */
export async function recordAvailabilityChange(
  client: pg.PoolClient,
  tenantId: string,
  branchId: string,
  productId: string,
  now: Date,
): Promise<void> {
  const [copy] = await readPosAvailability(client, branchId, now, [productId]);
  await appendSequencedChange(client, tenantId, {
    branchId,
    entity: POS_FEED_ENTITY.availability,
    entityId: productId,
    snapshot: copy ?? { productId, entries: [] },
  });
}
