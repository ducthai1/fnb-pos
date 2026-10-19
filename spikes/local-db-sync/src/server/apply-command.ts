import type { Pool, PoolClient } from "pg";
import { SYNC_ERROR_CODES } from "../shared/sync-error-codes";
import type { CommandResultWire, CommandWire } from "../shared/sync-wire-types";
import { type ChangeRow, commandOrderId, handleOrderCommand } from "./order-command-handlers";
import { readSnapshotWire } from "./server-order-rows";

export interface ApplyOptions {
  /**
   * Hold one advisory lock from before the first change_seq is drawn until commit. Without
   * it a bigserial is handed out in BEGIN order but becomes visible in COMMIT order, so a
   * puller can see seq 11, move its cursor past 10, and never see 10 when it commits.
   */
  serializeChanges: boolean;
  now: () => number;
  /** Test seam: runs just before COMMIT so a test can hold a transaction open. */
  beforeCommit?: (command: CommandWire) => Promise<void>;
}

// One key for the whole spike database. In the product it would be per tenant, which bounds
// the serialisation to one shop's tills.
const CHANGE_LOG_LOCK_KEY = 7_301_001;

async function insertChanges(client: PoolClient, commandId: string, changes: ChangeRow[]) {
  if (changes.length === 0) return;
  const params: unknown[] = [];
  const tuples = changes.map((change) => {
    params.push(change.entity, change.data.id, JSON.stringify(change.data), commandId);
    const n = params.length;
    return `($${n - 3}, $${n - 2}, $${n - 1}::jsonb, $${n})`;
  });
  await client.query(
    `INSERT INTO change_log (entity, entity_id, data, command_id) VALUES ${tuples.join(", ")}`,
    params,
  );
}

async function nextExpectedSeq(client: PoolClient, deviceId: string): Promise<number> {
  const { rows } = await client.query<{ last_seq: string }>(
    "SELECT last_seq FROM device_cursor WHERE device_id = $1 FOR UPDATE",
    [deviceId],
  );
  return rows[0] === undefined ? 1 : Number(rows[0].last_seq) + 1;
}

async function rejection(
  client: PoolClient,
  command: CommandWire,
  code: string,
  replayed: boolean,
): Promise<CommandResultWire> {
  const orderId = commandOrderId(command);
  const snapshot = await readSnapshotWire(client, orderId);
  return { command_id: command.command_id, status: "rejected", code, replayed, order_id: orderId, snapshot };
}

/** Applies one command in its own transaction; the same command_id twice changes nothing. */
export async function applyCommand(
  pool: Pool,
  deviceId: string,
  command: CommandWire,
  options: ApplyOptions,
): Promise<CommandResultWire> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (options.serializeChanges) {
      await client.query("SELECT pg_advisory_xact_lock($1)", [CHANGE_LOG_LOCK_KEY]);
    }
    const prior = await client.query<{ status: string; code: string | null }>(
      "SELECT status, code FROM applied_command WHERE command_id = $1",
      [command.command_id],
    );
    const stored = prior.rows[0];
    if (stored !== undefined) {
      const replay: CommandResultWire =
        stored.status === "accepted"
          ? { command_id: command.command_id, status: "accepted", replayed: true }
          : await rejection(client, command, stored.code ?? "", true);
      await client.query("COMMIT");
      return replay;
    }
    // Commands of one till depend on each other (add a line to the order created just
    // before), so they are applied strictly in device_seq order. A gap is not a rejection:
    // the till resends from the gap and nothing it did is lost.
    const expected = await nextExpectedSeq(client, deviceId);
    if (command.device_seq !== expected) {
      await client.query("ROLLBACK");
      return command.device_seq > expected
        ? { command_id: command.command_id, status: "retry", code: SYNC_ERROR_CODES.outOfOrder, expected_seq: expected }
        : await rejection(client, command, SYNC_ERROR_CODES.deviceSeqReused, false);
    }
    const outcome = await handleOrderCommand(client, deviceId, command, options.now());
    await client.query(
      `INSERT INTO applied_command (command_id, device_id, device_seq, type, status, code, order_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        command.command_id,
        deviceId,
        command.device_seq,
        command.type,
        outcome.status,
        outcome.status === "rejected" ? outcome.code : null,
        outcome.orderId,
      ],
    );
    await client.query(
      `INSERT INTO device_cursor (device_id, last_seq) VALUES ($1, $2)
       ON CONFLICT (device_id) DO UPDATE SET last_seq = excluded.last_seq`,
      [deviceId, command.device_seq],
    );
    let result: CommandResultWire;
    if (outcome.status === "accepted") {
      await insertChanges(client, command.command_id, outcome.changes);
      result = { command_id: command.command_id, status: "accepted", replayed: false };
    } else {
      result = await rejection(client, command, outcome.code, false);
    }
    await options.beforeCommit?.(command);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
