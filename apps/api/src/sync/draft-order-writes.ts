import type { SaveDraftPayload } from "@fnb/contracts";
import type { OrderChargeProfile } from "@fnb/domain";
import type pg from "pg";
import type { DeviceAuth } from "../devices/device-auth-hook";
import { chargeProfileToSnapshot } from "./charge-profile-snapshot";

/**
 * Opens the draft with the charge profile in effect for the till today; the order keeps
 * it, so a later change of the setting never reprices it. Answers false, writing nothing,
 * when the till already gave its order number to another order.
 */
export async function insertDraftHeader(
  client: pg.PoolClient,
  device: DeviceAuth,
  payload: SaveDraftPayload,
  businessDate: string,
  staffId: string,
  chargeProfile: OrderChargeProfile,
): Promise<boolean> {
  const inserted = await client.query(
    "INSERT INTO sales_order (id, tenant_id, branch_id, device_id, status, service_type, " +
      "channel_key, business_date, device_order_no, charge_profile, created_by) " +
      "VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7, $8, $9, $10) " +
      "ON CONFLICT ON CONSTRAINT sales_order_device_order_no_once DO NOTHING",
    [
      payload.orderId,
      device.tenantId,
      device.branchId,
      device.deviceId,
      payload.serviceType,
      payload.channelKey,
      businessDate,
      payload.deviceOrderNo,
      JSON.stringify(chargeProfileToSnapshot(chargeProfile)),
      staffId,
    ],
  );
  return inserted.rowCount === 1;
}

export async function updateDraftHeader(client: pg.PoolClient, payload: SaveDraftPayload) {
  await client.query(
    "UPDATE sales_order SET service_type = $2, channel_key = $3, version = version + 1, " +
      "updated_at = now() WHERE id = $1",
    [payload.orderId, payload.serviceType, payload.channelKey],
  );
}

/** Records that a command changed the order's lines, for tills comparing versions. */
export async function touchOrder(client: pg.ClientBase, orderId: string) {
  await client.query(
    "UPDATE sales_order SET version = version + 1, updated_at = now() WHERE id = $1",
    [orderId],
  );
}

/** Whether any of `lineIds` already belongs to an order other than `orderId`. */
export async function lineIdsTakenElsewhere(
  client: pg.PoolClient,
  orderId: string,
  lineIds: readonly string[],
): Promise<boolean> {
  const { rowCount } = await client.query(
    "SELECT 1 FROM sales_order_line WHERE id = ANY($1::uuid[]) AND order_id <> $2 LIMIT 1",
    [lineIds, orderId],
  );
  return rowCount === 1;
}
