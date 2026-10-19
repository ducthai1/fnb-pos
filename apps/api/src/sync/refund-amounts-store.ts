import { newId } from "@fnb/db";
import { type RefundAmounts, basisPoints, vnd } from "@fnb/domain";
import type pg from "pg";

interface AmountRow {
  line_id: string;
  sold_line_id: string;
  gross: string;
  discount_allocated: string;
  tax: string;
  service_charge: string;
  service_charge_tax: string;
}

/**
 * What a refund gives back, as buildRefund fixed it, or null on a sale. The tax mode is
 * read from the refund's own columns, never from a profile of today.
 */
export async function readRefundAmounts(
  client: pg.ClientBase,
  orderId: string,
  pricesIncludeTax: boolean | null,
  serviceChargeTaxRateBp: number | null,
): Promise<RefundAmounts | null> {
  if (pricesIncludeTax === null || serviceChargeTaxRateBp === null) return null;
  const { rows } = await client.query<AmountRow>(
    "SELECT a.* FROM refund_line_amount a JOIN sales_order_line l ON l.id = a.line_id " +
      "WHERE a.order_id = $1 ORDER BY l.position, l.id",
    [orderId],
  );
  return {
    pricesIncludeTax,
    serviceChargeTaxRate: basisPoints(serviceChargeTaxRateBp),
    lines: rows.map((row) => ({
      lineId: row.line_id,
      soldLineId: row.sold_line_id,
      gross: vnd(BigInt(row.gross)),
      discountAllocated: vnd(BigInt(row.discount_allocated)),
      tax: vnd(BigInt(row.tax)),
      serviceCharge: vnd(BigInt(row.service_charge)),
      serviceChargeTax: vnd(BigInt(row.service_charge_tax)),
    })),
  };
}

/** Stores a refund's amounts; its lines must be written first, as the amounts point at them. */
export async function insertRefundAmounts(
  client: pg.ClientBase,
  tenantId: string,
  orderId: string,
  amounts: RefundAmounts,
  staffId: string,
) {
  for (const line of amounts.lines) {
    await client.query(
      "INSERT INTO refund_line_amount (id, tenant_id, order_id, line_id, sold_line_id, gross, " +
        "discount_allocated, tax, service_charge, service_charge_tax, created_by) " +
        "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
      [
        newId(),
        tenantId,
        orderId,
        line.lineId,
        line.soldLineId,
        line.gross.toString(),
        line.discountAllocated.toString(),
        line.tax.toString(),
        line.serviceCharge.toString(),
        line.serviceChargeTax.toString(),
        staffId,
      ],
    );
  }
}
