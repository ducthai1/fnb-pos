import type { PosBootstrapWire } from "@fnb/contracts";
import type pg from "pg";
import { readDeviceConfigSnapshot } from "../../configuration/device-config-snapshot";
import type { DeviceAuth } from "../../devices/device-auth-hook";
import { feedVersionOf, readBranchCursor } from "../../sync/change-feed";
import { readBootstrapMenu } from "./bootstrap-menu";

interface PlaceRow {
  device_name: string;
  branch_name: string;
  brand_id: string;
  brand_name: string;
  utc_offset_minutes: number;
  business_day_start_minute: number;
}

/**
 * Everything a till starts selling with, in the caller's withTenant transaction.
 *
 * The cursor is read first, under READ COMMITTED: every change at or below it has committed
 * and is visible to every read that follows. A change committing between those reads is
 * numbered above the cursor, so the till pulls it again and replaces its copy with the same
 * content; read the other way round, a change committing in between would be inside the
 * cursor but missing from the copies, and the till would never get it.
 */
export async function readPosBootstrap(
  client: pg.PoolClient,
  device: DeviceAuth,
  now: Date,
): Promise<PosBootstrapWire> {
  const cursor = await readBranchCursor(client, device.branchId);
  const version = feedVersionOf(cursor);
  const { rows } = await client.query<PlaceRow>(
    "SELECT d.name AS device_name, b.name AS branch_name, b.brand_id, br.name AS brand_name, " +
      "b.utc_offset_minutes, b.business_day_start_minute FROM device d " +
      "JOIN branch b ON b.tenant_id = d.tenant_id AND b.id = d.branch_id " +
      "JOIN brand br ON br.tenant_id = b.tenant_id AND br.id = b.brand_id WHERE d.id = $1",
    [device.deviceId],
  );
  const place = rows[0];
  if (place === undefined)
    throw new Error(`device ${device.deviceId} of a valid credential is gone`);
  return {
    cursor,
    device: { id: device.deviceId, name: place.device_name, branchId: device.branchId },
    branch: {
      id: device.branchId,
      brandId: place.brand_id,
      name: place.branch_name,
      utcOffsetMinutes: place.utc_offset_minutes,
      businessDayStartMinute: place.business_day_start_minute,
    },
    brand: { id: place.brand_id, name: place.brand_name },
    config: { ...(await readDeviceConfigSnapshot(client, device.deviceId)), version },
    staff: await readBranchStaff(client, device.branchId),
    menu: await readBootstrapMenu(
      client,
      { brandId: place.brand_id, branchId: device.branchId },
      now,
      version,
    ),
  };
}

/**
 * Who works at the branch, for the PIN screen: names and whether they may still sign in.
 * Columns are named one by one, never `*`, so the PIN hash and lockout state of a staff row
 * cannot reach a till whatever is added to the table later.
 */
async function readBranchStaff(client: pg.PoolClient, branchId: string) {
  const { rows } = await client.query<{ id: string; display_name: string; active: boolean }>(
    "SELECT s.id, s.display_name, s.active FROM staff s WHERE EXISTS " +
      "(SELECT 1 FROM staff_branch sb WHERE sb.staff_id = s.id AND sb.branch_id = $1) " +
      "ORDER BY s.display_name, s.id",
    [branchId],
  );
  return rows.map((row) => ({ id: row.id, displayName: row.display_name, active: row.active }));
}
