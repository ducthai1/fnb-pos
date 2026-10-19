import type { RefundOrderPayload } from "@fnb/contracts";
import type { Order, RefundAmounts } from "@fnb/domain";
import type pg from "pg";
import { chargeProfileToSnapshot } from "./charge-profile-snapshot";
import type { StoredOrder } from "./stored-order";
import type { SyncCommandContext } from "./sync-command-context";

/**
 * Opens the refund as a draft of the till's branch, carrying the sale's charge profile and
 * tax mode so it reads the same whatever the branch's profile is today. Answers false,
 * writing nothing, when the till already gave its order number to another order.
 */
export async function insertRefundHeader(
  client: pg.ClientBase,
  { device, staffId, command }: SyncCommandContext,
  sale: StoredOrder,
  { refund, amounts }: { refund: Order; amounts: RefundAmounts },
  payload: RefundOrderPayload,
): Promise<boolean> {
  const inserted = await client.query(
    "INSERT INTO sales_order (id, tenant_id, branch_id, device_id, status, service_type, " +
      "channel_key, business_date, refund_of_order_id, device_order_no, charge_profile, " +
      "refund_prices_include_tax, refund_service_charge_tax_rate_bp, reason_code, created_by) " +
      "VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) " +
      "ON CONFLICT ON CONSTRAINT sales_order_device_order_no_once DO NOTHING",
    [
      refund.id,
      device.tenantId,
      device.branchId,
      device.deviceId,
      refund.serviceType,
      refund.channelKey,
      command.businessDate,
      sale.order.id,
      payload.deviceOrderNo,
      JSON.stringify(chargeProfileToSnapshot(sale.chargeProfile)),
      amounts.pricesIncludeTax,
      amounts.serviceChargeTaxRate,
      payload.reasonCode,
      staffId,
    ],
  );
  return inserted.rowCount === 1;
}
