import { type OrderLine, quantityToDecimalString } from "@fnb/domain";
import type pg from "pg";
import type { DeviceAuth } from "../devices/device-auth-hook";
import { DEFAULT_CHARGE_PROFILE, chargeProfileToSnapshot } from "./charge-profile-snapshot";
import type { SaveDraftPayload } from "./sync-request-schemas";

/**
 * Opens the draft with the branch's charge profile of today. Answers false, writing
 * nothing, when the till already gave its order number to another order.
 */
export async function insertDraftHeader(
  client: pg.PoolClient,
  device: DeviceAuth,
  payload: SaveDraftPayload,
  businessDate: string,
  staffId: string,
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
      JSON.stringify(chargeProfileToSnapshot(DEFAULT_CHARGE_PROFILE)),
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

/**
 * Replaces the draft's lines with `lines`, parents before children as given. Removing them
 * all first is only possible while nothing else points at a draft's lines; once kitchen
 * tickets or voids reference them this must become an update by line id.
 */
export async function replaceDraftLines(
  client: pg.PoolClient,
  tenantId: string,
  orderId: string,
  lines: readonly OrderLine[],
  staffId: string,
) {
  await client.query("DELETE FROM sales_order_line WHERE order_id = $1", [orderId]);
  for (const [position, line] of lines.entries()) {
    await client.query(
      "INSERT INTO sales_order_line (id, tenant_id, order_id, position, parent_line_id, line_type, " +
        "product_id, variant_id, modifier_option_id, name_snapshot, unit_price, quantity, " +
        "tax_rate_bp, note, price_source, reverses_line_id, created_by) " +
        "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)",
      [
        line.id,
        tenantId,
        orderId,
        position,
        line.parentLineId,
        line.lineType,
        line.productId,
        line.variantId,
        line.modifierOptionId,
        line.nameSnapshot,
        line.unitPrice.toString(),
        quantityToDecimalString(line.quantity),
        line.taxRate,
        line.note,
        line.priceSource,
        line.reversesLineId,
        staffId,
      ],
    );
  }
}
