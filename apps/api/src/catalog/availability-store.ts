import type { AvailabilityBodyInput } from "@fnb/contracts";
import { newId } from "@fnb/db";
import type pg from "pg";
import { lockTenantChangeFeed } from "../sync/change-feed";
import { recordAvailabilityChange } from "./catalog-change-feed";
import type { CatalogWriteContext } from "./catalog-row-writes";

/**
 * A manual "86" switched on or off, in the caller's transaction: the branch ran out, or has
 * it again. Putting it back removes the entry for that channel only, so an all-channel
 * entry and a single-channel one are switched independently. The branch's tills hear of
 * it in the same transaction, which takes the tenant's feed lock first, as a sync command does.
 */
export async function saveAvailability(
  client: pg.PoolClient,
  context: CatalogWriteContext,
  body: AvailabilityBodyInput,
  until: Date | null,
): Promise<void> {
  await lockTenantChangeFeed(client, context.tenantId);
  if (body.available) {
    await client.query(
      "DELETE FROM product_availability WHERE product_id = $1 AND branch_id = $2 " +
        "AND channel_key IS NOT DISTINCT FROM $3",
      [body.productId, body.branchId, body.channelKey],
    );
  } else {
    await client.query(
      "INSERT INTO product_availability (id, tenant_id, product_id, branch_id, channel_key, " +
        "unavailable_until, created_at, updated_at, created_by) " +
        "VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8) " +
        "ON CONFLICT ON CONSTRAINT product_availability_once DO UPDATE SET " +
        "unavailable_until = EXCLUDED.unavailable_until, updated_at = EXCLUDED.updated_at, " +
        "version = product_availability.version + 1",
      [
        newId(),
        context.tenantId,
        body.productId,
        body.branchId,
        body.channelKey,
        until,
        context.now,
        context.appUserId,
      ],
    );
  }
  await recordAvailabilityChange(
    client,
    context.tenantId,
    body.branchId,
    body.productId,
    context.now,
  );
}
