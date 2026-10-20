import { withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import {
  command,
  line,
  orderIdOf,
  pay,
  pullAll,
  pushOne,
  saveDraft,
  tillsClock,
} from "../support/sync-commands";
import { type SyncShop, type Till, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool, clock: tillsClock() });
  s = await syncShop(app, pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

/** A draft of one coffee with an extra shot: 39.000đ, prices including VAT. */
async function draftOf39k(till: Till = s.tillA) {
  const extra = {
    groupId: s.menu.coffee.extrasGroup,
    optionId: s.menu.coffee.extraShot,
    quantity: 1,
  };
  const sent = saveDraft(till, [line(s.menu.coffee.id, { modifiers: [extra] })]);
  expect((await pushOne(app, till, sent)).status).toBe("accepted");
  return orderIdOf(sent);
}

const paymentsOf = (orderId: string) =>
  withTenant(
    pool,
    s.shop.tenantId,
    async (client) =>
      (
        await client.query(
          "SELECT method, amount::int AS amount FROM payment WHERE order_id = $1",
          [orderId],
        )
      ).rows,
  );

describe("order.pay", () => {
  it("closes the order with its payments and answers with the paid order", async () => {
    const orderId = await draftOf39k();
    const result = await pushOne(
      app,
      s.tillA,
      command(s.tillA, "order.pay", {
        orderId,
        payments: [
          { method: "cash", amount: 20_000 },
          { method: "card", amount: 19_000 },
        ],
        expectedAmountDue: 39_000,
      }),
    );
    expect(result.status).toBe("accepted");
    expect(result.snapshot).toMatchObject({ id: orderId, status: "paid", version: 2 });
    expect(result.snapshot?.payments.map(({ method, amount }) => ({ method, amount }))).toEqual([
      { method: "cash", amount: 20_000 },
      { method: "card", amount: 19_000 },
    ]);
    expect(
      result.snapshot?.payments.every((entry) => entry.receivedByStaffId === s.tillA.staffId),
    ).toBe(true);
  });

  it("puts the paid order in the change feed exactly as the result showed it", async () => {
    const orderId = await draftOf39k();
    const result = await pushOne(app, s.tillA, pay(s.tillA, orderId, 39_000));
    const { changes } = await pullAll(app, s.tillB);
    const latest = changes.filter((change) => change.entityId === orderId).at(-1);
    expect(latest?.snapshot).toEqual(result.snapshot);
  });
});

describe("order.pay refuses", () => {
  it("a total the customer was not asked for, keeping the order a draft", async () => {
    const orderId = await draftOf39k();
    const result = await pushOne(app, s.tillA, pay(s.tillA, orderId, 29_000));
    expect(result).toMatchObject({ status: "rejected", code: "DOMAIN_ORDER_TOTAL_MISMATCH" });
    expect(result.snapshot?.status).toBe("draft");
    expect(await paymentsOf(orderId)).toEqual([]);
  });

  it("payments that do not add up to the amount due", async () => {
    const orderId = await draftOf39k();
    const result = await pushOne(app, s.tillA, pay(s.tillA, orderId, 39_000, 38_000));
    expect(result).toMatchObject({
      status: "rejected",
      code: "SYNC_PAYMENTS_DO_NOT_MATCH_AMOUNT_DUE",
    });
    expect(await paymentsOf(orderId)).toEqual([]);
  });

  it("an order already paid, and records no second payment", async () => {
    const orderId = await draftOf39k();
    await pushOne(app, s.tillA, pay(s.tillA, orderId, 39_000));
    const second = await pushOne(app, s.tillB, pay(s.tillB, orderId, 39_000));
    expect(second).toMatchObject({ status: "rejected", code: "DOMAIN_ORDER_ALREADY_PAID" });
    expect(await paymentsOf(orderId)).toEqual([{ method: "cash", amount: 39_000 }]);
  });

  it("an order it cannot find, or one of another branch, without showing it", async () => {
    const theirs = await draftOf39k(s.otherBranchTill);
    const results = [
      await pushOne(app, s.tillA, pay(s.tillA, "0199f000-0000-7000-8000-000000000001", 1)),
      await pushOne(app, s.tillA, pay(s.tillA, theirs, 39_000)),
    ];
    expect(results.map(({ status, code, snapshot }) => ({ status, code, snapshot }))).toEqual([
      { status: "rejected", code: "SYNC_ORDER_NOT_FOUND", snapshot: undefined },
      { status: "rejected", code: "SYNC_ORDER_NOT_FOUND", snapshot: undefined },
    ]);
    expect(await paymentsOf(theirs)).toEqual([]);
  });
});
