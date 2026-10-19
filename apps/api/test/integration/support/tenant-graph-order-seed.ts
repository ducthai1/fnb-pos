import {
  drizzleFor,
  lineVoidRecord,
  payment,
  refundLineAmount,
  salesOrder,
  salesOrderLine,
  shift,
} from "@fnb/db";
import type pg from "pg";

export interface OrderSeedIds {
  branch: string;
  device: string;
  staff: string;
  sales_order: string;
  sales_order_line: string;
  refund_line_amount: string;
  payment: string;
  line_void_record: string;
  shift: string;
}

/**
 * One row in every order table. The order stays a draft: a closed order refuses new rows
 * under it, and the tenancy tests insert more of them.
 */
export async function seedOrderAndSyncRows(
  client: pg.PoolClient,
  tenantId: string,
  ids: OrderSeedIds,
): Promise<void> {
  const db = drizzleFor(client);
  const order = ids.sales_order;
  const line = ids.sales_order_line;
  await db.insert(salesOrder).values({
    id: order,
    tenantId,
    branchId: ids.branch,
    deviceId: ids.device,
    status: "draft",
    serviceType: "takeaway",
    businessDate: "2026-10-20",
    deviceOrderNo: 1,
    chargeProfile: {},
  });
  await db.insert(salesOrderLine).values({
    id: line,
    tenantId,
    orderId: order,
    position: 0,
    lineType: "item",
    nameSnapshot: "Trà sữa trân châu",
    unitPrice: 35_000n,
    quantity: "1",
    taxRateBp: 800,
    priceSource: "base",
  });
  // The graph has a single line, so it stands in for both sides of the refund amount.
  await db.insert(refundLineAmount).values({
    id: ids.refund_line_amount,
    tenantId,
    orderId: order,
    lineId: line,
    soldLineId: line,
    gross: 0n,
    discountAllocated: 0n,
    tax: 0n,
    serviceCharge: 0n,
    serviceChargeTax: 0n,
  });
  await db.insert(payment).values({
    id: ids.payment,
    tenantId,
    orderId: order,
    method: "cash",
    amount: 35_000n,
    receivedByStaffId: ids.staff,
  });
  await db.insert(lineVoidRecord).values({
    id: ids.line_void_record,
    tenantId,
    orderId: order,
    lineId: line,
    quantity: "1",
    fromUnsent: "1",
    fromSent: "0",
    reasonCode: "customer_changed_mind",
    staffId: ids.staff,
  });
  await db.insert(shift).values({
    id: ids.shift,
    tenantId,
    branchId: ids.branch,
    status: "open",
    openedByStaffId: ids.staff,
    openingCash: 500_000n,
    businessDate: "2026-10-20",
  });
}
