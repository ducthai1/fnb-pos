import { type DailySalesReport, moneyToWire } from "@fnb/contracts";
import {
  type Quantity,
  type Vnd,
  ZERO_VND,
  addQuantity,
  addVnd,
  localClockParts,
  quantity,
  quantityToDecimalString,
} from "@fnb/domain";
import type pg from "pg";
import { soldOrderOf } from "../einvoice/sold-lines-of-order";
import { type StoredOrder, readStoredOrder } from "../sync/stored-order";
import { ItemTally, PaymentTally, TotalsTally } from "./daily-sales-tallies";
import { voidedUnitsValue } from "./voided-units-value";

interface ClosedOrderRow {
  id: string;
  refund_of_order_id: string | null;
  paid_at: Date;
}

/**
 * The branch's sales report for one business day (definitions on dailySalesReportSchema),
 * or null when the current tenant has no such branch. Everything is read back from the
 * orders as stored and priced by the domain, order by order, then added up: the report
 * never prices anything its own way, so it agrees with every bill and invoice of the day.
 */
export async function readDailySalesReport(
  client: pg.ClientBase,
  branchId: string,
  businessDate: string,
): Promise<DailySalesReport | null> {
  const branch = await client.query<{ utc_offset_minutes: number }>(
    "SELECT utc_offset_minutes FROM branch WHERE id = $1",
    [branchId],
  );
  const offset = branch.rows[0]?.utc_offset_minutes;
  if (offset === undefined) return null;
  // paid_at is the till's moment of payment; orders closed before it was recorded fall back
  // to the server's time of the change. An order paid after the day was closed is left out:
  // the close froze the day's figures, and the day's status lists such orders beside it.
  const { rows } = await client.query<ClosedOrderRow>(
    "SELECT id, refund_of_order_id, coalesce(paid_at, updated_at) AS paid_at FROM sales_order " +
      "WHERE branch_id = $1 AND business_date = $2 AND status IN ('paid', 'posted') " +
      "AND NOT paid_after_day_close ORDER BY 3, id",
    [branchId, businessDate],
  );
  const sales = new TotalsTally();
  const refunds = new TotalsTally();
  const items = new ItemTally();
  const payments = new PaymentTally();
  const hours = new Map<number, { orderCount: number; collected: Vnd }>();
  const loaded = new Map<string, StoredOrder>();
  for (const row of rows) {
    const stored = await readStoredOrder(client, row.id, false);
    if (stored === null) continue;
    loaded.set(row.id, stored);
    const sold = soldOrderOf(stored);
    const refund = row.refund_of_order_id !== null;
    for (const payment of stored.payments) payments.add(payment.method, payment.amount, refund);
    if (refund) {
      refunds.add(sold.totals);
      continue;
    }
    sales.add(sold.totals);
    items.add(sold.lines);
    const hour = Math.floor(localClockParts(row.paid_at.getTime(), offset).minuteOfDay / 60);
    const sum = hours.get(hour) ?? { orderCount: 0, collected: ZERO_VND };
    hours.set(hour, {
      orderCount: sum.orderCount + 1,
      collected: addVnd(sum.collected, sold.totals.amountDue),
    });
  }
  return {
    branchId,
    businessDate,
    sales: {
      orderCount: sales.orderCount,
      gross: moneyToWire(sales.gross),
      discount: moneyToWire(sales.discount),
      net: moneyToWire(sales.net),
      serviceCharge: moneyToWire(sales.serviceCharge),
      tax: moneyToWire(sales.tax),
      taxByRate: sales.taxByRate(),
      netExcludingTax: moneyToWire(sales.netExcludingTax()),
      collected: moneyToWire(sales.collected),
    },
    refunds: {
      orderCount: refunds.orderCount,
      collected: moneyToWire(refunds.collected),
      tax: moneyToWire(refunds.tax),
      taxByRate: refunds.taxByRate(),
    },
    payments: payments.rows(),
    byHour: [...hours.entries()]
      .sort(([a], [b]) => a - b)
      .map(([hour, sum]) => ({
        hour,
        orderCount: sum.orderCount,
        collected: moneyToWire(sum.collected),
      })),
    items: items.rows(),
    voids: await voidsOfTheDay(client, branchId, businessDate, loaded),
    cancelledOrders: await cancelledOrderCount(client, branchId, businessDate),
  };
}

interface VoidSum {
  productId: string | null;
  variantId: string | null;
  name: string;
  count: number;
  quantity: Quantity;
  value: Vnd;
}

/** Units cancelled from the day's orders, by product and variant, whatever became of them. */
async function voidsOfTheDay(
  client: pg.ClientBase,
  branchId: string,
  businessDate: string,
  loaded: Map<string, StoredOrder>,
): Promise<DailySalesReport["voids"]> {
  const { rows } = await client.query<{ order_id: string; line_id: string; quantity: string }>(
    "SELECT v.order_id, v.line_id, v.quantity::text AS quantity FROM line_void_record v " +
      "JOIN sales_order o ON o.id = v.order_id WHERE o.branch_id = $1 AND o.business_date = $2 " +
      "ORDER BY v.created_at, v.id",
    [branchId, businessDate],
  );
  const byItem = new Map<string, VoidSum>();
  let total = ZERO_VND;
  for (const row of rows) {
    const stored = loaded.get(row.order_id) ?? (await readStoredOrder(client, row.order_id, false));
    const line = stored?.order.lines.find((candidate) => candidate.id === row.line_id);
    if (stored === null || stored === undefined || line === undefined) continue;
    const units = quantity(row.quantity);
    const value = voidedUnitsValue(stored.order.lines, line.id, units);
    total = addVnd(total, value);
    const key = `${line.productId}|${line.variantId}`;
    const sum = byItem.get(key) ?? {
      productId: line.productId,
      variantId: line.variantId,
      name: line.nameSnapshot,
      count: 0,
      quantity: quantity(0),
      value: ZERO_VND,
    };
    byItem.set(key, {
      ...sum,
      count: sum.count + 1,
      quantity: addQuantity(sum.quantity, units),
      value: addVnd(sum.value, value),
    });
  }
  return {
    count: rows.length,
    value: moneyToWire(total),
    items: [...byItem.values()].map((sum) => ({
      ...sum,
      quantity: quantityToDecimalString(sum.quantity),
      value: moneyToWire(sum.value),
    })),
  };
}

async function cancelledOrderCount(client: pg.ClientBase, branchId: string, businessDate: string) {
  const { rows } = await client.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM sales_order " +
      "WHERE branch_id = $1 AND business_date = $2 AND status = 'cancelled'",
    [branchId, businessDate],
  );
  return rows[0]?.n ?? 0;
}
