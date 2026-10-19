import type pg from "pg";
import type { DeviceAuth } from "../devices/device-auth-hook";
import { hashToken } from "../security/opaque-token";

/** Sent by the till beside its own `Authorization: Device` credential. */
export const STAFF_SESSION_HEADER = "x-staff-session";

export interface CurrentStaffSession {
  staffId: string;
  displayName: string;
  roleId: string;
  expiresAt: Date;
}

/**
 * The staff member working this till, read inside withTenant of the device's tenant. The
 * staff token alone proves nothing: it counts only on the device it was issued to,
 * presented with that device's live credential, while the staff member is still active.
 */
export async function findCurrentStaffSession(
  client: pg.ClientBase,
  device: DeviceAuth,
  token: unknown,
  now: Date,
): Promise<CurrentStaffSession | undefined> {
  if (typeof token !== "string") return undefined;
  const result = await client.query<{
    staff_id: string;
    display_name: string;
    role_id: string;
    expires_at: Date;
  }>(
    "SELECT s.id AS staff_id, s.display_name, s.role_id, ss.expires_at FROM staff_session ss " +
      "JOIN staff s ON s.tenant_id = ss.tenant_id AND s.id = ss.staff_id " +
      "WHERE ss.token_hash = $1 AND ss.device_id = $2 AND ss.revoked_at IS NULL " +
      "AND ss.expires_at > $3 AND s.active",
    [hashToken(token), device.deviceId, now],
  );
  const row = result.rows[0];
  if (row === undefined) return undefined;
  return {
    staffId: row.staff_id,
    displayName: row.display_name,
    roleId: row.role_id,
    expiresAt: row.expires_at,
  };
}
