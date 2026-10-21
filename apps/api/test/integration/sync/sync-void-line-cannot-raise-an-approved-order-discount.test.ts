import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { freshTill } from "../support/shift-commands";
import { approve, hireManager } from "../support/sync-approvals";
import { line, orderIdOf, pay, pushOne, saveDraft, tillsClock } from "../support/sync-commands";
import { discount, voidUnits, withApproval } from "../support/sync-order-commands";
import { type SyncShop, type Till, syncShop } from "../support/sync-shop";

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
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

/**
 * Four coffees (116.000 đ) with 10% off the whole order (11.600 đ), given on `till` by
 * whoever is signed in there, through a manager's approval when `approved`.
 */
async function fourCoffeesTenPercentOff(till: Till, approved: boolean) {
  const coffee = line(s.menu.coffee.id, { quantity: "4" });
  const draft = saveDraft(till, [coffee]);
  expect((await pushOne(app, till, draft)).status).toBe("accepted");
  const orderId = orderIdOf(draft);
  const off = discount(till, orderId, {
    scope: "order",
    discount: { kind: "percent", rate: 1000 },
  });
  const sent = approved
    ? withApproval(
        off,
        await approve(app, till, managerId, {
          key: "order_discount",
          discountRate: 1000,
          subject: { orderId },
        }),
      )
    : off;
  expect((await pushOne(app, till, sent)).status).toBe("accepted");
  return { orderId, coffee };
}

describe("order.void_line under an order discount", () => {
  it("is refused when the fixed discount would become a larger share than the cashier may give", async () => {
    // The cashier may give no order discount at all; the manager approved 10% of four coffees.
    const till = await freshTill(app, s);
    const { orderId, coffee } = await fourCoffeesTenPercentOff(till, true);

    const voided = await pushOne(app, till, voidUnits(till, orderId, coffee.lineId, "3"));
    expect(voided).toMatchObject({ status: "rejected", code: "SYNC_DISCOUNT_RATE_RAISED" });
    // Nothing moved: four coffees still owe 104.400 đ, and 17.400 đ does not pay them.
    expect(voided.snapshot?.lines[0]).toMatchObject({ id: coffee.lineId, quantity: "4" });
    const cheap = await pushOne(app, till, pay(till, orderId, 17_400));
    expect(cheap).toMatchObject({ status: "rejected", code: "DOMAIN_ORDER_TOTAL_MISMATCH" });
    expect((await pushOne(app, till, pay(till, orderId, 104_400))).status).toBe("accepted");
  });

  it("goes through for staff who may give the larger share themselves", async () => {
    const till = await freshTill(app, s, managerId);
    const { orderId, coffee } = await fourCoffeesTenPercentOff(till, false);

    const voided = await pushOne(app, till, voidUnits(till, orderId, coffee.lineId, "3"));
    expect(voided.status).toBe("accepted");
    expect(voided.snapshot?.lines[0]).toMatchObject({ id: coffee.lineId, quantity: "1" });
    // The discount stays the 11.600 đ it was given as: 40% of the one coffee left.
    expect((await pushOne(app, till, pay(till, orderId, 17_400))).status).toBe("accepted");
  });

  it("goes through for the cashier when no order discount is on the bill", async () => {
    const till = await freshTill(app, s);
    const coffee = line(s.menu.coffee.id, { quantity: "4" });
    const draft = saveDraft(till, [coffee]);
    expect((await pushOne(app, till, draft)).status).toBe("accepted");
    const orderId = orderIdOf(draft);
    const voided = await pushOne(app, till, voidUnits(till, orderId, coffee.lineId, "3"));
    expect(voided.status).toBe("accepted");
    expect((await pushOne(app, till, pay(till, orderId, 29_000))).status).toBe("accepted");
  });
});
