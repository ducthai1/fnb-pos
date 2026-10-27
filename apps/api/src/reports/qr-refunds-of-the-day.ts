import { type DailySalesReport, moneyToWire } from "@fnb/contracts";
import { type Vnd, ZERO_VND, addVnd, vnd } from "@fnb/domain";
import type pg from "pg";

/**
 * QR money no sale counted that was handed back to customers on the branch's business day,
 * by how it went back: each one a transfer's whole amount, as the bank brought it. Money
 * handed back once the day was closed stays out, so a closed day reads as its close froze
 * it; the day's status lists it beside the close.
 */
export async function qrRefundsOfTheDay(
  client: pg.ClientBase,
  branchId: string,
  businessDate: string,
): Promise<DailySalesReport["qrRefunds"]> {
  const { rows } = await client.query<{ method: string; amount: string }>(
    "SELECT refund_method AS method, COALESCE(refund_amount, received_amount) AS amount " +
      "FROM payment_intent " +
      "WHERE branch_id = $1 AND refund_business_date = $2 AND refunded_at IS NOT NULL " +
      "AND NOT refunded_after_day_close " +
      "ORDER BY refund_method, refunded_at, id",
    [branchId, businessDate],
  );
  const byMethod = new Map<string, { count: number; amount: Vnd }>();
  let total = ZERO_VND;
  for (const row of rows) {
    const amount = vnd(BigInt(row.amount));
    const sum = byMethod.get(row.method) ?? { count: 0, amount: ZERO_VND };
    byMethod.set(row.method, { count: sum.count + 1, amount: addVnd(sum.amount, amount) });
    total = addVnd(total, amount);
  }
  return {
    count: rows.length,
    amount: moneyToWire(total),
    byMethod: [...byMethod].map(([method, sum]) => ({
      method,
      count: sum.count,
      amount: moneyToWire(sum.amount),
    })),
  };
}
