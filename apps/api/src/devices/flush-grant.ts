import type pg from "pg";
import { hashToken } from "../security/opaque-token";
import type { DeviceAuth } from "./device-auth-hook";
import { readDeviceToken } from "./device-token";

/**
 * Who presents `authorization`: a till whose every credential was revoked (`revoked`), one
 * still paired (`live`), or nobody the server knows (`unknown`). Only a revoked till may send
 * under a flush grant: a live one has its usual sync, and an unknown token proves nothing.
 */
export type FlushCaller =
  | { readonly kind: "revoked"; readonly device: DeviceAuth }
  | { readonly kind: "live" }
  | { readonly kind: "unknown" };

export async function flushCallerOf(
  client: pg.ClientBase,
  authorization: string | undefined,
): Promise<FlushCaller> {
  const presented = readDeviceToken(authorization);
  if (presented === null) return { kind: "unknown" };
  const { rows } = await client.query<{
    device_id: string;
    branch_id: string;
    revoked: boolean;
  }>(
    "SELECT c.device_id, d.branch_id, c.revoked_at IS NOT NULL AS revoked FROM device_credential c " +
      "JOIN device d ON d.tenant_id = c.tenant_id AND d.id = c.device_id WHERE c.token_hash = $1",
    [hashToken(presented.token)],
  );
  const found = rows[0];
  if (found === undefined) return { kind: "unknown" };
  if (!found.revoked) return { kind: "live" };
  return {
    kind: "revoked",
    device: { deviceId: found.device_id, branchId: found.branch_id, tenantId: presented.tenantId },
  };
}

export interface LiveFlushGrant {
  readonly id: string;
  readonly createdByAppUserId: string;
}

/**
 * The grant `codeHash` names for `deviceId`, while it is unexpired and unfinished; its first
 * use is stamped here. One answer for a wrong code, another device's code, an expired one and
 * a finished one, so probing says nothing about which grants exist.
 */
export async function claimFlushGrant(
  client: pg.ClientBase,
  deviceId: string,
  codeHash: string,
  now: Date,
): Promise<LiveFlushGrant | null> {
  const { rows } = await client.query<{ id: string; created_by_app_user_id: string }>(
    "UPDATE device_flush_grant SET first_used_at = COALESCE(first_used_at, $3), updated_at = $3 " +
      "WHERE code_hash = $1 AND device_id = $2 AND finished_at IS NULL AND expires_at > $3 " +
      "RETURNING id, created_by_app_user_id",
    [codeHash, deviceId, now],
  );
  const row = rows[0];
  return row === undefined ? null : { id: row.id, createdByAppUserId: row.created_by_app_user_id };
}

/** Spends the grant: the till sent its last batch, and the code works no more. */
export async function finishFlushGrant(client: pg.ClientBase, grantId: string, now: Date) {
  await client.query(
    "UPDATE device_flush_grant SET finished_at = $2, updated_at = $2, version = version + 1 " +
      "WHERE id = $1 AND finished_at IS NULL",
    [grantId, now],
  );
}

/**
 * Whom a flushed command is recorded as made by: the staff member of the session the till
 * stamped on it, if that session was opened on this very till; otherwise the author of the
 * till's last command the server took, as the usual sync puts an unstamped command under
 * whoever is signed in. Null when the till never had either, which a till that sold cannot be.
 */
export async function flushedCommandAuthor(
  client: pg.ClientBase,
  deviceId: string,
  staffSessionId: string | undefined,
): Promise<string | null> {
  if (staffSessionId !== undefined) {
    const session = await client.query<{ staff_id: string }>(
      "SELECT staff_id FROM staff_session WHERE id = $1 AND device_id = $2",
      [staffSessionId, deviceId],
    );
    const staffId = session.rows[0]?.staff_id;
    if (staffId !== undefined) return staffId;
  }
  const last = await client.query<{ staff_id: string }>(
    "SELECT staff_id FROM applied_command WHERE device_id = $1 ORDER BY device_seq DESC LIMIT 1",
    [deviceId],
  );
  return last.rows[0]?.staff_id ?? null;
}
