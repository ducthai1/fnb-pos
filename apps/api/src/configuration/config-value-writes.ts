import { POS_FEED_ENTITY } from "@fnb/contracts";
import { newId } from "@fnb/db";
import type pg from "pg";
import type { CatalogWriteContext } from "../catalog/catalog-row-writes";
import { appendSequencedChange, lockTenantChangeFeed } from "../sync/change-feed";
import { readDeviceConfigSnapshot } from "./device-config-snapshot";

/** Where a value is set: a brand, a branch or one till, as config_value.scope_kind names it. */
export interface ConfigScope {
  scopeKind: "brand" | "branch" | "device";
  scopeId: string;
}

/**
 * Sets one setting at one scope, in the caller's transaction, and sends every till under
 * that scope its settings as they now resolve. Building those copies is also the check: a
 * value no till could run with (a charge profile that is not one) throws, and the
 * transaction keeps the old value instead of handing tills something they cannot apply.
 */
export async function saveConfigValue(
  client: pg.PoolClient,
  context: CatalogWriteContext,
  scope: ConfigScope,
  key: string,
  value: unknown,
): Promise<void> {
  await lockTenantChangeFeed(client, context.tenantId);
  await client.query(
    "INSERT INTO config_value (id, tenant_id, scope_kind, scope_id, key, value, created_at, " +
      "updated_at, created_by, updated_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, $8) " +
      "ON CONFLICT ON CONSTRAINT config_value_tenant_id_scope_key_key DO UPDATE SET " +
      "value = EXCLUDED.value, updated_at = EXCLUDED.updated_at, " +
      "updated_by = EXCLUDED.updated_by, version = config_value.version + 1",
    [
      newId(),
      context.tenantId,
      scope.scopeKind,
      scope.scopeId,
      key,
      JSON.stringify(value),
      context.now,
      context.appUserId,
    ],
  );
  await recordDeviceConfigChanges(client, context.tenantId, scope);
}

/** Removes a setting at one scope, so it inherits again, and tells the tills under it. */
export async function clearConfigValue(
  client: pg.PoolClient,
  context: CatalogWriteContext,
  scope: ConfigScope,
  key: string,
): Promise<void> {
  await lockTenantChangeFeed(client, context.tenantId);
  const removed = await client.query(
    "DELETE FROM config_value WHERE scope_kind = $1 AND scope_id = $2 AND key = $3",
    [scope.scopeKind, scope.scopeId, key],
  );
  if (removed.rowCount !== 0) await recordDeviceConfigChanges(client, context.tenantId, scope);
}

/*
 * One copy per till, on its own branch's feed, keyed by the till's device id: each till
 * resolves differently once a till-level value exists. The till list is read after the
 * feed lock, so a till paired before this write began is on it; one paired while it runs
 * waits at the bootstrap barrier for this write to commit and starts from its result.
 */
async function recordDeviceConfigChanges(
  client: pg.PoolClient,
  tenantId: string,
  scope: ConfigScope,
): Promise<void> {
  const { rows } = await client.query<{ id: string; branch_id: string }>(
    "SELECT d.id, d.branch_id FROM device d " +
      "JOIN branch b ON b.tenant_id = d.tenant_id AND b.id = d.branch_id " +
      "WHERE ($1::text = 'brand' AND b.brand_id = $2::uuid) " +
      "OR ($1::text = 'branch' AND d.branch_id = $2::uuid) " +
      "OR ($1::text = 'device' AND d.id = $2::uuid) ORDER BY d.id",
    [scope.scopeKind, scope.scopeId],
  );
  for (const device of rows) {
    await appendSequencedChange(client, tenantId, {
      branchId: device.branch_id,
      entity: POS_FEED_ENTITY.deviceConfig,
      entityId: device.id,
      snapshot: await readDeviceConfigSnapshot(client, device.id),
    });
  }
}
