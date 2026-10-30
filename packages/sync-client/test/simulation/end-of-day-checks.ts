import { isDeepStrictEqual } from "node:util";
import { withTenant } from "@fnb/db";
import { feedChanges, serverLedger } from "../support/server-truth";
import { shownOrders } from "../support/scenario-till";
import { checkDayReports } from "./day-report-checks";
import type { DayRun } from "./day-runner";
import type { BookedOrder } from "./shop-books";

interface StoredLine {
  id: string;
  order_id: string;
  line_type: string;
  quantity: string;
  reverses_line_id: string | null;
}

interface StoredOrderRow {
  id: string;
  status: string;
  refund_of_order_id: string | null;
  business_date: string;
}

const money = (value: unknown): number => Number(value);

/** The call number a till shows for an order, from its index among the branch's tills. */
const callNumberOf = (deviceOrderNo: number, deviceIndex: number | null, tills: number) =>
  deviceIndex !== null && tills >= 2
    ? deviceIndex * 100 + (deviceOrderNo % 100)
    : ((deviceOrderNo - 1) % 100) + 1;

export interface DayCheck {
  readonly violations: string[];
  /** What the check saw, for the report a run prints. */
  readonly facts: Record<string, unknown>;
}

/**
 * The day's books against the system, every way they can disagree. Collects every
 * disagreement instead of stopping at the first, so one run shows the whole damage.
 */
export async function checkEndOfDay(run: DayRun): Promise<DayCheck> {
  const { ctx, books, window } = run;
  const { shop } = ctx;
  const violations: string[] = [];
  const facts: Record<string, unknown> = {};
  const say = (message: string) => violations.push(message);
  const tenantId = shop.shop.shop.tenantId;
  const branchId = shop.shop.shop.branchId;
  const historyOf = async (orderId: string) => {
    const history = await query<{
      device_id: string;
      device_seq: string;
      type: string;
      status: string;
      code: string | null;
      lines: { lineId: string }[] | null;
    }>(
      "SELECT device_id, device_seq, type, status, code, payload->'lines' AS lines FROM applied_command " +
        "WHERE payload->>'orderId' = $1 ORDER BY created_at, device_seq",
      [orderId],
    );
    return history
      .map((entry) => {
        const who = shop.devices.find((device) => device.record.deviceId === entry.device_id)?.name;
        const lineIds = entry.lines?.map((line) => line.lineId.slice(-4)).join(",");
        return `${who}#${entry.device_seq} ${entry.type} ${entry.status}${entry.code === null ? "" : `(${entry.code})`}${lineIds === undefined ? "" : ` [${lineIds}]`}`;
      })
      .join(" | ");
  };
  const query = <Row extends object>(sql: string, values: unknown[] = []) =>
    withTenant(
      shop.server.pool,
      tenantId,
      async (client) => (await client.query<Row>(sql, values)).rows,
    );

  // 1. No order lost, none twice, none that nobody made.
  const rows = await query<StoredOrderRow>(
    "SELECT id, status, refund_of_order_id, business_date::text AS business_date FROM sales_order WHERE branch_id = $1 AND business_date = $2",
    [branchId, window.businessDate],
  );
  const stored = new Map(rows.map((row) => [row.id, row]));
  const expectedIds = new Set([
    ...books.orders.keys(),
    ...books.refunds.map((refund) => refund.refundOrderId),
  ]);
  for (const id of expectedIds)
    if (!stored.has(id)) say(`order ${id} was rung up and is not on the server`);
  for (const id of stored.keys())
    if (!expectedIds.has(id)) say(`the server holds order ${id} nobody rang up`);
  if (rows.length !== new Set(rows.map((row) => row.id)).size)
    say("the server holds an order twice");
  facts.orders = books.orders.size;
  facts.refunds = books.refunds.length;

  // 2. Each one ended as the shop ended it, with the money and the goods the shop took.
  const lines = await query<StoredLine>(
    "SELECT l.id, l.order_id, l.line_type, l.quantity::text AS quantity, l.reverses_line_id " +
      "FROM sales_order_line l JOIN sales_order o ON o.id = l.order_id WHERE o.branch_id = $1 AND o.business_date = $2",
    [branchId, window.businessDate],
  );
  const payments = await query<{ order_id: string; method: string; amount: string }>(
    "SELECT p.order_id, p.method, p.amount::text AS amount FROM payment p JOIN sales_order o ON o.id = p.order_id WHERE o.branch_id = $1 AND o.business_date = $2",
    [branchId, window.businessDate],
  );
  for (const order of books.orders.values()) {
    const row = stored.get(order.id);
    if (row === undefined) continue;
    if (row.status !== order.state)
      say(
        `order ${order.id} (${order.openedBy} #${order.deviceOrderNo}) is ${row.status}, the shop settled it ${order.state}`,
      );
    if (row.business_date !== window.businessDate)
      say(`order ${order.id} is booked to ${row.business_date}, not ${window.businessDate}`);
    if (order.state === "paid") {
      const before = violations.length;
      checkGoods(
        order,
        lines.filter((line) => line.order_id === order.id),
        say,
      );
      if (violations.length > before)
        say(`  what the server did with order ${order.id}: ${await historyOf(order.id)}`);
    }
    const taken = payments.filter((payment) => payment.order_id === order.id);
    if (order.state === "paid") {
      const [only, ...more] = taken;
      if (only === undefined || more.length > 0)
        say(`order ${order.id} has ${taken.length} payments, the shop took one`);
      else if (only.method !== order.method || money(only.amount) !== order.amountDue) {
        say(
          `order ${order.id}: server took ${only.amount} by ${only.method}, the shop took ${order.amountDue} by ${order.method}`,
        );
      }
    } else if (taken.length > 0) say(`order ${order.id} was not paid but holds a payment`);
  }
  for (const refund of books.refunds) {
    const taken = payments.filter((payment) => payment.order_id === refund.refundOrderId);
    if (taken.length !== 1 || money(taken[0]?.amount) !== -refund.amount) {
      say(
        `refund ${refund.refundOrderId} paid out ${taken.map((p) => p.amount).join(",")}, the shop handed back ${refund.amount}`,
      );
    }
  }

  // 3. Every command went once: none lost, none refused, none repeated.
  let accepted = 0;
  let refused = 0;
  for (const device of shop.devices) {
    const ledger = await serverLedger(shop.server, shop.shop, device.record);
    accepted += ledger.accepted;
    refused += ledger.rejected;
    if (ledger.changeRowsWrittenTwice > 0) say("a command wrote its change twice");
    if ((await device.till.client.pendingCount()) > 0)
      say(`${device.name} still has commands waiting`);
    const stuck = (await device.till.client.rejectedCommands()).filter(
      (entry) => !books.meantToBeRefused.has(entry.command.commandId),
    );
    for (const entry of stuck)
      say(
        `${device.name}: "needs attention" holds ${entry.command.type} (${entry.code}) nobody meant to refuse`,
      );
  }
  const meant = books.earlier.refused + books.meantToBeRefused.size;
  if (refused !== meant) say(`the server refused ${refused} commands, the script meant ${meant}`);
  const issued = books.earlier.commands + books.commandsIssued;
  if (accepted + refused !== issued)
    say(
      `the shop issued ${issued} commands, the server accepted ${accepted} and refused ${refused}`,
    );
  facts.commands = accepted + refused;
  facts.refused = refused;

  // 4. Every till shows what the server holds.
  const feed = await feedChanges(shop.server, shop.shop.tillA);
  const newest = (entity: string) => {
    const latest = new Map<string, unknown>();
    for (const change of feed)
      if (change.entity === entity) latest.set(change.entityId, change.snapshot);
    return latest;
  };
  for (const device of shop.devices) {
    const orders = await shownOrders(device.till);
    const truth = newest("order");
    if (orders.size !== truth.size)
      say(`${device.name} shows ${orders.size} orders, the server holds ${truth.size}`);
    for (const [id, snapshot] of truth) {
      if (!isDeepStrictEqual(orders.get(id), snapshot))
        say(`${device.name} shows order ${id} differently from the server`);
    }
    const shifts = new Map(
      (await device.till.client.snapshots("shift")).map((view) => [view.entityId, view.snapshot]),
    );
    for (const [id, snapshot] of newest("shift")) {
      if (!isDeepStrictEqual(shifts.get(id), snapshot))
        say(`${device.name} shows shift ${id} differently from the server`);
    }
  }

  // 5. The cash in each drawer is what the system says it should be.
  const shiftTruth = newest("shift") as Map<
    string,
    { status: string; close: { expectedCash: number; difference: number } | null }
  >;
  for (const booked of books.shifts) {
    const shift = shiftTruth.get(booked.shiftId);
    if (shift?.status !== "closed" || shift.close === null)
      say(`${booked.device}: the shift is not closed on the server`);
    else if (shift.close.expectedCash !== booked.counted || shift.close.difference !== 0) {
      say(
        `${booked.device}: the cashier counted ${booked.counted}, the system expected ${shift.close.expectedCash} (difference ${shift.close.difference})`,
      );
    }
  }

  // 6. No two tills of the branch call the same number.
  const calls = new Map<number, string>();
  const tills = shop.devices.length;
  for (const order of books.orders.values()) {
    const index = shop.devices.findIndex((device) => device.name === order.openedBy) + 1;
    const call = callNumberOf(order.deviceOrderNo, index, tills);
    const owner = calls.get(call);
    if (owner !== undefined && owner !== order.openedBy)
      say(`call ${call} is used by ${owner} and ${order.openedBy}`);
    calls.set(call, order.openedBy);
  }
  Object.assign(facts, await checkDayReports(run, say));
  return { violations, facts };
}

/** The goods of a settled order: every unit the shop put on it, and no other. */
function checkGoods(
  order: BookedOrder,
  stored: StoredLine[],
  say: (message: string) => void,
): void {
  const reversed = new Map<string, number>();
  for (const line of stored) {
    if (line.reverses_line_id !== null)
      reversed.set(
        line.reverses_line_id,
        (reversed.get(line.reverses_line_id) ?? 0) + Math.abs(Number(line.quantity)),
      );
  }
  const net = new Map<string, number>();
  for (const line of stored) {
    if (line.line_type === "item" && line.reverses_line_id === null) {
      net.set(line.id, Number(line.quantity) - (reversed.get(line.id) ?? 0));
    }
  }
  for (const [lineId, item] of order.items) {
    const has = net.get(lineId);
    if (has === undefined)
      say(`order ${order.id}: the line ${lineId} (${item.quantity} of ${item.productId}) is gone`);
    else if (has !== Number(item.quantity))
      say(`order ${order.id}: line ${lineId} has ${has} units, the shop sold ${item.quantity}`);
  }
  for (const [lineId, units] of net) {
    if (!order.items.has(lineId) && units > 0)
      say(`order ${order.id}: the server holds line ${lineId} the shop never put on it`);
  }
}
