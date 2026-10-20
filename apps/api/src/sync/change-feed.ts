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
  /** Null for a change no till command made, such as a transfer the bank reported. */
  commandId: string | null;
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

export interface SequencedChange {
  branchId: string;
  entity: string;
  entityId: string;
  /** The copy without its version; null when the copy is gone. */
  snapshot: Record<string, unknown> | null;
}

/**
 * Appends a copy whose version is its own change_seq, for copies assembled from several
 * rows (a product and the groups it shares, a till's inherited settings), which no single
 * row version follows. The number is drawn first so the copy can carry it; the caller
 * holds lockTenantChangeFeed, so drawing it early changes nothing about commit order.
 */
export async function appendSequencedChange(
  client: pg.ClientBase,
  tenantId: string,
  change: SequencedChange,
) {
  const { rows } = await client.query<{ seq: string }>(
    "SELECT nextval('change_log_change_seq_seq')::text AS seq",
  );
  const seq = rows[0]?.seq;
  if (seq === undefined) throw new Error("nextval returned no row");
  const snapshot =
    change.snapshot === null ? null : { ...change.snapshot, version: feedVersionOf(seq) };
  await client.query(
    "INSERT INTO change_log (id, tenant_id, change_seq, branch_id, entity, entity_id, snapshot) " +
      "VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [
      newId(),
      tenantId,
      seq,
      change.branchId,
      change.entity,
      change.entityId,
      JSON.stringify(snapshot),
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

/**
 * Where a till starting from scratch begins pulling: the branch's newest change, or "0".
 * Writers hold the tenant's feed lock from drawing change_seq until COMMIT, so every change
 * of the tenant numbered at or below a committed one has committed too; read first in a
 * transaction, the cursor covers only changes the reads after it can see.
 */
export async function readBranchCursor(client: pg.ClientBase, branchId: string): Promise<string> {
  const { rows } = await client.query<{ seq: string | null }>(
    "SELECT max(change_seq) AS seq FROM change_log WHERE branch_id = $1",
    [branchId],
  );
  return rows[0]?.seq ?? "0";
}

/**
 * A feed position as the version of a till's copy. A JSON number holds change_seq exactly
 * up to 2^53, which a feed drawing a million numbers a day reaches in 24 000 years; past
 * it the copy would carry a rounded version, so that throws instead.
 */
export function feedVersionOf(changeSeq: string): number {
  const version = Number(changeSeq);
  if (!Number.isSafeInteger(version)) throw new RangeError(`change_seq ${changeSeq} is too big`);
  return version;
}
