import { newId } from "@fnb/db";
import type pg from "pg";
import type { SyncCommandEnvelope, SyncCommandResult } from "./sync-wire-types";

/** What the ledger knows of a command id, as seen from the till sending it. */
export interface CommandIdUse {
  /** This till's answer to the id the first time it was applied, if it was. */
  readonly stored: SyncCommandResult | undefined;
  /** Another till of the tenant used the id first: its answer is never this till's. */
  readonly takenByAnotherTill: boolean;
}

/**
 * Command ids are a till's own: a till is answered only from its own ledger, so an id that
 * another till drew first never hands this one that till's answer or its order.
 */
export async function commandIdUseOf(
  client: pg.ClientBase,
  commandId: string,
  deviceId: string,
): Promise<CommandIdUse> {
  const { rows } = await client.query<{ device_id: string; result: SyncCommandResult }>(
    "SELECT device_id, result FROM applied_command WHERE command_id = $1",
    [commandId],
  );
  return {
    stored: rows.find((row) => row.device_id === deviceId)?.result,
    takenByAnotherTill: rows.some((row) => row.device_id !== deviceId),
  };
}

/** The device_seq this till must send next; its sync state row stays locked until COMMIT. */
export async function nextExpectedSeq(client: pg.ClientBase, deviceId: string): Promise<number> {
  const { rows } = await client.query<{ last_seq: string }>(
    "SELECT last_seq FROM device_sync_state WHERE device_id = $1 FOR UPDATE",
    [deviceId],
  );
  return rows[0] === undefined ? 1 : Number(rows[0].last_seq) + 1;
}

/** The device_seq of the till's last command the ledger holds, 0 before its first. */
export async function lastDeviceSeqOf(client: pg.ClientBase, deviceId: string): Promise<number> {
  const { rows } = await client.query<{ last_seq: string }>(
    "SELECT last_seq FROM device_sync_state WHERE device_id = $1",
    [deviceId],
  );
  return rows[0] === undefined ? 0 : Number(rows[0].last_seq);
}

/** The till that sent a command and the staff member signed in on it. */
export interface CommandSender {
  readonly tenantId: string;
  readonly deviceId: string;
  readonly staffId: string;
}

/** Records the outcome and moves the till's sequence past this command, in one transaction. */
export async function recordOutcome(
  client: pg.ClientBase,
  sender: CommandSender,
  command: SyncCommandEnvelope,
  result: SyncCommandResult,
) {
  if (result.status === "retry") throw new Error("a retry is never stored");
  const { tenantId, deviceId, staffId } = sender;
  await client.query(
    "INSERT INTO applied_command (id, tenant_id, device_id, staff_id, command_id, device_seq, " +
      "type, status, code, payload, result) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
    [
      newId(),
      tenantId,
      deviceId,
      staffId,
      command.commandId,
      command.deviceSeq,
      command.type,
      result.status,
      result.code ?? null,
      JSON.stringify(command.payload ?? {}),
      JSON.stringify(result),
    ],
  );
  await client.query(
    "INSERT INTO device_sync_state (id, tenant_id, device_id, last_seq) VALUES ($1, $2, $3, $4) " +
      "ON CONFLICT (tenant_id, device_id) DO UPDATE SET last_seq = excluded.last_seq, " +
      "version = device_sync_state.version + 1, updated_at = now()",
    [newId(), tenantId, deviceId, command.deviceSeq],
  );
}
