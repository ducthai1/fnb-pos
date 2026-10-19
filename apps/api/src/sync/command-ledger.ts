import { newId } from "@fnb/db";
import type pg from "pg";
import type { SyncCommandEnvelope, SyncCommandResult } from "./sync-wire-types";

/** The answer stored for this command id the first time it was applied, if it was. */
export async function storedResultOf(
  client: pg.ClientBase,
  commandId: string,
): Promise<SyncCommandResult | undefined> {
  const { rows } = await client.query<{ result: SyncCommandResult }>(
    "SELECT result FROM applied_command WHERE command_id = $1",
    [commandId],
  );
  return rows[0]?.result;
}

/** The device_seq this till must send next; its sync state row stays locked until COMMIT. */
export async function nextExpectedSeq(client: pg.ClientBase, deviceId: string): Promise<number> {
  const { rows } = await client.query<{ last_seq: string }>(
    "SELECT last_seq FROM device_sync_state WHERE device_id = $1 FOR UPDATE",
    [deviceId],
  );
  return rows[0] === undefined ? 1 : Number(rows[0].last_seq) + 1;
}

/** Records the outcome and moves the till's sequence past this command, in one transaction. */
export async function recordOutcome(
  client: pg.ClientBase,
  tenantId: string,
  deviceId: string,
  command: SyncCommandEnvelope,
  result: SyncCommandResult,
) {
  if (result.status === "retry") throw new Error("a retry is never stored");
  await client.query(
    "INSERT INTO applied_command (id, tenant_id, device_id, command_id, device_seq, type, status, " +
      "code, payload, result) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
    [
      newId(),
      tenantId,
      deviceId,
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
