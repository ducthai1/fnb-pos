import { withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { approve, hireManager, signInAs } from "../support/sync-approvals";
import {
  latestOrders,
  line,
  orderIdOf,
  pay,
  pullAll,
  pushOne,
  saveDraft,
  tillsClock,
} from "../support/sync-commands";
import { discount, refund, withApproval } from "../support/sync-order-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;
let managerId: string;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool, clock: tillsClock() });
  s = await syncShop(app, pool);
  managerId = await hireManager(app, s);
  // Till B is the manager's: sales there carry an order discount, and refunds need nobody.
  await signInAs(app, s, s.tillB, "manager");
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

/** Three 29.000đ coffees with 10.000đ off the order, paid 77.000đ: 3.333,33đ off each cup. */
async function paidSale() {
  const coffee = line(s.menu.coffee.id, { quantity: "3" });
  const draft = saveDraft(s.tillB, [coffee]);
  await pushOne(app, s.tillB, draft);
  const orderId = orderIdOf(draft);
  const off = discount(s.tillB, orderId, {
    scope: "order",
    discount: { kind: "fixed", amount: 10_000 },
  });
  expect((await pushOne(app, s.tillB, off)).status).toBe("accepted");
  expect((await pushOne(app, s.tillB, pay(s.tillB, orderId, 77_000))).status).toBe("accepted");
  return { orderId, lineId: coffee.lineId };
}

const cups = (lineId: string, quantity: string, restock = false) => [{ lineId, quantity, restock }];

const refundsOf = (saleId: string) =>
  withTenant(pool, s.shop.tenantId, async (client) => {
    const { rows } = await client.query(
      "SELECT o.status, o.reason_code, sum(p.amount)::int AS paid_out FROM sales_order o " +
        "JOIN payment p ON p.order_id = o.id WHERE o.refund_of_order_id = $1 " +
        "GROUP BY o.id ORDER BY o.id",
      [saleId],
    );
    return rows;
  });

describe("order.refund", () => {
  // What each refund gives back, worked out from the sale's own discount share per cup;
  // the last one takes the rounding đồng, so every split adds up to the 77.000đ paid.
  it.each([
    [["3"], [-77_000]],
    [
      ["1", "2"],
      [-25_666, -51_334],
    ],
    [
      ["2", "1"],
      [-51_333, -25_667],
    ],
    [
      ["1", "1", "1"],
      [-25_666, -25_667, -25_667],
    ],
  ])("refunding %j cups at a time gives back %j", async (split, amounts) => {
    const sale = await paidSale();
    for (const [index, units] of split.entries()) {
      const amount = amounts[index] ?? 0;
      const off = refund(s.tillB, sale.orderId, cups(sale.lineId, units), amount + 1);
      expect((await pushOne(app, s.tillB, off)).code).toBe("SYNC_PAYMENTS_DO_NOT_MATCH_AMOUNT_DUE");
      const exact = await pushOne(
        app,
        s.tillB,
        refund(s.tillB, sale.orderId, cups(sale.lineId, units), amount),
      );
      expect(exact.status).toBe("accepted");
    }
    const refunds = await refundsOf(sale.orderId);
    expect(refunds.reduce((sum, row) => sum + row.paid_out, 0)).toBe(-77_000);
    expect(refunds.every((row) => row.status === "paid" && row.reason_code === "wrong_drink")).toBe(
      true,
    );
    const more = await pushOne(
      app,
      s.tillB,
      refund(s.tillB, sale.orderId, cups(sale.lineId, "1"), -1),
    );
    expect(more.code).toBe("DOMAIN_ORDER_REFUND_EXCEEDS_REMAINING");
  });

  it("publishes the paid refund with what it gave back, for every till of the branch", async () => {
    const sale = await paidSale();
    const sent = refund(s.tillB, sale.orderId, cups(sale.lineId, "1", true), -25_666);
    await pushOne(app, s.tillB, sent);
    const refundId = (sent.payload as { refundOrderId: string }).refundOrderId;
    const seen = latestOrders((await pullAll(app, s.tillA)).changes).get(refundId);
    expect(seen).toMatchObject({
      status: "paid",
      refundOfOrderId: sale.orderId,
      reasonCode: "wrong_drink",
      payments: [{ method: "cash", amount: -25_666 }],
    });
    expect(seen?.lines[0]).toMatchObject({
      reversesLineId: sale.lineId,
      quantity: "-1",
      restock: true,
    });
    const given = seen?.refundAmounts?.lines.map((amounts) => ({
      soldLineId: amounts.soldLineId,
      net: amounts.gross - amounts.discountAllocated,
    }));
    expect(given).toEqual([{ soldLineId: sale.lineId, net: -25_666 }]);
  });

  it("asks a cashier for a manager's approval", async () => {
    const sale = await paidSale();
    const alone = await pushOne(
      app,
      s.tillA,
      refund(s.tillA, sale.orderId, cups(sale.lineId, "1"), -25_666),
    );
    expect(alone).toMatchObject({ status: "rejected", code: "SYNC_APPROVAL_REQUIRED" });
    const approvalId = await approve(app, s.tillA, managerId, { key: "refund" });
    const sent = withApproval(
      refund(s.tillA, sale.orderId, cups(sale.lineId, "1"), -25_666),
      approvalId,
    );
    expect((await pushOne(app, s.tillA, sent)).status).toBe("accepted");
  });

  it("refuses a sale that is not paid yet", async () => {
    const draft = saveDraft(s.tillB, [line(s.menu.coffee.id)]);
    await pushOne(app, s.tillB, draft);
    const lineId = (draft.payload as { lines: { lineId: string }[] }).lines[0]?.lineId ?? "";
    const result = await pushOne(
      app,
      s.tillB,
      refund(s.tillB, orderIdOf(draft), cups(lineId, "1"), -29_000),
    );
    expect(result.code).toBe("DOMAIN_ORDER_REFUND_REQUIRES_PAID_ORDER");
  });

  it("refuses a sale of another branch, or of another shop, as if it did not exist", async () => {
    const sale = await paidSale();
    const elsewhere = refund(s.otherBranchTill, sale.orderId, cups(sale.lineId, "1"), -25_666);
    expect(await pushOne(app, s.otherBranchTill, elsewhere)).toEqual({
      commandId: elsewhere.commandId,
      status: "rejected",
      code: "SYNC_ORDER_NOT_FOUND",
    });
    const other = await syncShop(app, pool);
    const foreign = refund(other.tillA, sale.orderId, cups(sale.lineId, "1"), -25_666);
    expect((await pushOne(app, other.tillA, foreign)).code).toBe("SYNC_ORDER_NOT_FOUND");
    expect(await refundsOf(sale.orderId)).toEqual([]);
  });
});
