import type { PriceListDocumentInput } from "@fnb/contracts";
import type { PriceListItem } from "@fnb/domain";
import type pg from "pg";
import { lockTenantChangeFeed } from "../sync/change-feed";
import { recordPriceListChange } from "./catalog-change-feed";
import { CATALOG_API_ERROR_CODES } from "./catalog-api-error-codes";
import { CatalogRequestError } from "./catalog-request-error";
import { type CatalogWriteContext, insertCatalogRow, putVersionedRow } from "./catalog-row-writes";
import { amountOf } from "./product-document";

const scopeIdOf = (scope: PriceListItem["scope"]): string | null => {
  switch (scope.kind) {
    case "variant":
      return scope.variantId;
    case "product":
      return scope.productId;
    case "category":
      return scope.categoryId;
    case "global":
      return null;
  }
};

const instantOf = (epoch: number | null): Date | null => (epoch === null ? null : new Date(epoch));

/**
 * Creates or replaces the list; its items are rewritten, as an item is only a rule. Takes
 * the tenant's feed lock first, as a sync command does, and tells the brand's tills.
 */
export async function writePriceList(
  client: pg.PoolClient,
  context: CatalogWriteContext,
  id: string,
  input: PriceListDocumentInput,
  items: readonly PriceListItem[],
): Promise<{ created: boolean }> {
  await lockTenantChangeFeed(client, context.tenantId);
  const saved = await putVersionedRow(client, context, {
    table: "price_list",
    id,
    expectedVersion: input.version,
    parent: { column: "brand_id", value: input.brandId },
    cells: { name: input.name },
    notFoundCode: CATALOG_API_ERROR_CODES.priceListNotFound,
  });
  await client.query("DELETE FROM price_list_item WHERE price_list_id = $1", [id]);
  for (const item of items) {
    const { effect } = item;
    await insertCatalogRow(client, "price_list_item", context, {
      id: item.id,
      price_list_id: id,
      scope_kind: item.scope.kind,
      scope_id: scopeIdOf(item.scope),
      branch_id: item.branchId,
      channel_key: item.channelKey,
      valid_from: instantOf(item.validFrom),
      valid_to: instantOf(item.validTo),
      days_of_week: item.daysOfWeek,
      start_minute: item.timeWindow?.startMinute ?? null,
      end_minute: item.timeWindow?.endMinute ?? null,
      effect_kind: effect.kind,
      fixed_price: effect.kind === "fixed_price" ? effect.price : null,
      percent_off_bp: effect.kind === "percent_off" ? effect.rate : null,
      rounding: effect.kind === "percent_off" ? effect.rounding : null,
      priority: item.priority,
    });
  }
  await recordPriceListChange(client, context.tenantId, input.brandId, id);
  return { created: saved.created };
}

/** The list as the backoffice edits it, items by id; null when this tenant has none by that id. */
export async function readPriceList(client: pg.PoolClient, id: string) {
  const list = await client.query(
    "SELECT id, brand_id, name, version FROM price_list WHERE id = $1",
    [id],
  );
  const header = list.rows[0];
  if (header === undefined) return null;
  const items = await client.query(
    "SELECT * FROM price_list_item WHERE price_list_id = $1 ORDER BY id",
    [id],
  );
  return {
    id: header.id,
    brandId: header.brand_id,
    name: header.name,
    version: header.version,
    items: items.rows.map((row) => ({
      id: row.id,
      scope: scopeOf(row.scope_kind, row.scope_id),
      branchId: row.branch_id,
      channelKey: row.channel_key,
      validFrom: row.valid_from === null ? null : row.valid_from.toISOString(),
      validTo: row.valid_to === null ? null : row.valid_to.toISOString(),
      daysOfWeek: row.days_of_week,
      timeWindow:
        row.start_minute === null
          ? null
          : { startMinute: row.start_minute, endMinute: row.end_minute },
      effect:
        row.effect_kind === "fixed_price"
          ? { kind: "fixed_price", price: amountOf(row.fixed_price) }
          : { kind: "percent_off", rateBp: row.percent_off_bp, rounding: row.rounding },
      priority: row.priority,
    })),
  };
}

function scopeOf(kind: string, scopeId: string | null) {
  if (kind === "variant") return { kind, variantId: scopeId };
  if (kind === "product") return { kind, productId: scopeId };
  if (kind === "category") return { kind, categoryId: scopeId };
  return { kind };
}

/** The brand's lists for the list screen: header and how many rules each holds. */
export async function listPriceLists(client: pg.PoolClient, brandId: string) {
  const result = await client.query(
    `SELECT l.id, l.brand_id, l.name, l.version, count(i.id)::int AS item_count
       FROM price_list l LEFT JOIN price_list_item i ON i.price_list_id = l.id
      WHERE l.brand_id = $1 GROUP BY l.id ORDER BY l.name, l.id`,
    [brandId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    brandId: row.brand_id,
    name: row.name,
    version: row.version,
    itemCount: row.item_count,
  }));
}

/**
 * Removes the list and its rules. Nothing else points at a list (an order keeps the price
 * it was sold at), so it can always go, provided the caller saw its current version; the
 * brand's tills are told it is gone.
 */
export async function deletePriceList(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  expectedVersion: number,
): Promise<boolean> {
  await lockTenantChangeFeed(client, tenantId);
  const found = await client.query<{ brand_id: string; version: number }>(
    "SELECT brand_id, version FROM price_list WHERE id = $1 FOR UPDATE",
    [id],
  );
  const brandId = found.rows[0]?.brand_id;
  if (brandId === undefined) return false;
  if (found.rows[0]?.version !== expectedVersion) {
    throw new CatalogRequestError(409, CATALOG_API_ERROR_CODES.versionConflict);
  }
  await client.query("DELETE FROM price_list_item WHERE price_list_id = $1", [id]);
  await client.query("DELETE FROM price_list WHERE id = $1", [id]);
  await recordPriceListChange(client, tenantId, brandId, id);
  return true;
}
