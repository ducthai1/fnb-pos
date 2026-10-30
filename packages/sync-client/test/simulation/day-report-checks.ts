import { isDeepStrictEqual } from "node:util";
import type { DayRun } from "./day-runner";

interface Report {
  sales: { orderCount: number; collected: number | string };
  refunds: { orderCount: number; collected: number | string };
  payments: {
    method: string;
    sales: number | string;
    refunds: number | string;
    net: number | string;
  }[];
  byHour: { orderCount: number; collected: number | string }[];
  items: { lineType: string; quantity: string }[];
  voids: { count: number; items: { quantity: string }[] };
  cancelledOrders: number;
}

const sum = (values: readonly (number | string)[]) =>
  values.reduce<number>((total, value) => total + Number(value), 0);

/**
 * The manager's side of the day: the report as it is before the close, the close itself,
 * and the report after it. Each figure is compared with the shop's own books and with the
 * report's other lines, so a total that is right by luck is still caught by its parts.
 */
export async function checkDayReports(
  run: DayRun,
  say: (message: string) => void,
): Promise<Record<string, unknown>> {
  const { ctx, books, window } = run;
  const { shop } = ctx;
  const cookie = shop.shop.shop.managerCookie;
  const branchId = shop.shop.shop.branchId;
  const get = async (url: string) => {
    const answer = await shop.server.backoffice({ method: "GET", url, cookie });
    if (answer.status !== 200)
      throw new Error(`GET ${url} answered ${answer.status}: ${answer.body}`);
    return JSON.parse(answer.body) as Record<string, unknown>;
  };
  const reportUrl = `/reports/daily-sales?branchId=${branchId}&businessDate=${window.businessDate}`;
  const before = (await get(reportUrl)) as unknown as Report;

  const paid = books.sales;
  const sold = (method: string) =>
    sum(paid.filter((order) => order.method === method).map((order) => order.amountDue ?? 0));
  const refunded = sum(books.refunds.map((refund) => refund.amount));
  if (before.sales.orderCount !== paid.length)
    say(`report: ${before.sales.orderCount} sales, the shop made ${paid.length}`);
  if (Number(before.sales.collected) !== sold("cash") + sold("qr_transfer")) {
    say(
      `report: sales collected ${before.sales.collected}, the shop took ${sold("cash") + sold("qr_transfer")}`,
    );
  }
  if (before.refunds.orderCount !== books.refunds.length)
    say(`report: ${before.refunds.orderCount} refunds, the shop made ${books.refunds.length}`);
  if (Math.abs(Number(before.refunds.collected)) !== refunded)
    say(`report: refunds ${before.refunds.collected}, the shop handed back ${refunded}`);
  for (const method of ["cash", "qr_transfer"]) {
    const line = before.payments.find((payment) => payment.method === method);
    if (Number(line?.sales ?? 0) !== sold(method))
      say(`report: ${method} sales ${line?.sales ?? 0}, the shop took ${sold(method)}`);
  }
  // The lines add up to the totals.
  if (sum(before.byHour.map((hour) => hour.orderCount)) !== before.sales.orderCount)
    say("report: the hours do not add up to the sales count");
  if (sum(before.byHour.map((hour) => hour.collected)) !== Number(before.sales.collected))
    say("report: the hours do not add up to the money collected");
  if (sum(before.payments.map((payment) => payment.sales)) !== Number(before.sales.collected))
    say("report: the payment methods do not add up to the money collected");
  const unitsSold = sum(
    paid.flatMap((order) => [...order.items.values()].map((item) => item.quantity)),
  );
  const unitsReported = sum(
    before.items.filter((item) => item.lineType === "item").map((item) => item.quantity),
  );
  if (unitsReported !== unitsSold)
    say(`report: ${unitsReported} units on the item lines, the shop sold ${unitsSold}`);
  if (before.voids.count !== books.voidCount)
    say(`report: ${before.voids.count} voids, the shop made ${books.voidCount}`);
  const cancelled = [...books.orders.values()].filter(
    (order) => order.state === "cancelled",
  ).length;
  if (before.cancelledOrders !== cancelled)
    say(`report: ${before.cancelledOrders} cancelled orders, the shop cancelled ${cancelled}`);

  // The close: nothing is left open, and it freezes the figures.
  const closed = await shop.server.backoffice({
    method: "POST",
    url: `/branches/${branchId}/day-close`,
    cookie,
    payload: { businessDate: window.businessDate },
  });
  if (closed.status !== 201)
    say(`closing the day answered ${closed.status}: ${closed.body.slice(0, 300)}`);
  const after = await get(reportUrl);
  if (!isDeepStrictEqual(after, JSON.parse(JSON.stringify(before))))
    say("the report changed when the day was closed");
  return { sales: before.sales.orderCount, collected: before.sales.collected };
}
