import { newId } from "@fnb/db";
import type pg from "pg";
import type { SyncChange, SyncChangesPage } from "./sync-wire-types";

/**
 * Serialises the tenant's sync writes until COMMIT. change_seq is drawn in BEGIN order but
 * becomes visible in COMMIT order; without this lock a till could pull a later change, move
 * its cursor past an earlier one still uncommitted, and never receive it. Taken first in
 * the transaction, it also makes the idempotency lookup and the device_seq check of one
 * command atomic against a copy of the same command arriving at the same moment.
 * Per tenant, so one shop's tills never wait on another shop.
 */
export async function lockTenantChangeFeed(client: pg.ClientBase, tenantId: string) {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('fnb.change_feed.' || $1, 0))",
    [tenantId],
  );
}

export interface ChangeToAppend {
  branchId: string;
  entity: string;
  entityId: string;
  snapshot: unknown;
  commandId: string;
}

/** Appends one change; the caller holds lockTenantChangeFeed for this transaction. */
export async function appendChange(
  client: pg.ClientBase,
  tenantId: string,
  change: ChangeToAppend,
) {
  await client.query(
    "INSERT INTO change_log (id, tenant_id, branch_id, entity, entity_id, snapshot, command_id) " +
      "VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [
      newId(),
      tenantId,
      change.branchId,
      change.entity,
      change.entityId,
      JSON.stringify(change.snapshot),
      change.commandId,
    ],
  );
}

/**
 * The branch's changes strictly after `cursor`, oldest first. change_seq is selected as the
 * bigint it is (pg hands int8 over as text): casting it to text in the select list would make
 * ORDER BY sort "10" before "9", end a full page early and skip the rows sorted after it.
 */
export async function readChangesPage(
  client: pg.ClientBase,
  branchId: string,
  cursor: string,
  limit: number,
): Promise<SyncChangesPage> {
  const { rows } = await client.query<{
    change_seq: string;
    entity: string;
    entity_id: string;
    snapshot: unknown;
  }>(
    "SELECT change_seq, entity, entity_id, snapshot FROM change_log " +
      "WHERE branch_id = $1 AND change_seq > $2::bigint ORDER BY change_seq LIMIT $3",
    [branchId, cursor, limit],
  );
  const changes = rows.map((row): SyncChange => ({
    changeSeq: row.change_seq,
    entity: row.entity,
    entityId: row.entity_id,
    snapshot: row.snapshot,
  }));
  return { changes, nextCursor: changes.at(-1)?.changeSeq ?? cursor };
}
