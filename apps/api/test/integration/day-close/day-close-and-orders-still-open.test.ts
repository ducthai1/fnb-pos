import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { line, orderIdOf, pay, pushOne, saveDraft } from "../support/sync-commands";
import { cancel } from "../support/sync-order-commands";
import { type SyncShop, type Till, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool });
  s = await syncShop(app, pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const closeDay = (businessDate: string) =>
  app.inject({
    method: "POST",
    url: `/branches/${s.shop.branchId}/day-close`,
    headers: { cookie: s.shop.managerCookie },
    payload: { businessDate },
  });

const dayOf = async (businessDate: string) =>
  (
    await app.inject({
      method: "GET",
      url: `/branches/${s.shop.branchId}/day-close?businessDate=${businessDate}`,
      headers: { cookie: s.shop.managerCookie },
    })
  ).json();

const salesOf = async (businessDate: string) =>
  (
    await app.inject({
      method: "GET",
      url: `/reports/daily-sales?branchId=${s.shop.branchId}&businessDate=${businessDate}`,
      headers: { cookie: s.shop.managerCookie },
    })
  ).json().sales;

/** A cà phê sữa (29.000 đ) saved as a draft of `businessDate` on `till`. */
async function draftOn(till: Till, businessDate: string) {
  const sent = { ...saveDraft(till, [line(s.menu.coffee.id)]), businessDate };
  expect((await pushOne(app, till, sent)).status).toBe("accepted");
  return orderIdOf(sent);
}

const paid = async (till: Till, orderId: string, businessDate: string) =>
  (await pushOne(app, till, { ...pay(till, orderId, 29_000), businessDate })).status;

describe("closing a business day with a table still open", () => {
  it("is refused, naming the drafts of the day, and closes once they are settled", async () => {
    const day = "2026-10-16";
    const table = await draftOn(s.tillA, day);
    const left = await draftOn(s.tillB, day);
    // Another branch's draft, or one of another day, is not this day's business.
    await draftOn(s.otherBranchTill, day);
    await draftOn(s.tillA, "2026-10-17");

    const refused = await closeDay(day);
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toEqual({
      code: "API_DAY_CLOSE_DRAFTS_OPEN",
      drafts: expect.arrayContaining([
        { id: table, deviceId: s.tillA.deviceId, deviceOrderNo: expect.any(Number) },
        { id: left, deviceId: s.tillB.deviceId, deviceOrderNo: expect.any(Number) },
      ]),
    });
    expect(refused.json().drafts).toHaveLength(2);
    expect((await dayOf(day)).openDrafts).toHaveLength(2);

    expect(await paid(s.tillA, table, day)).toBe("accepted");
    expect((await pushOne(app, s.tillB, cancel(s.tillB, left))).status).toBe("accepted");
    const closed = await closeDay(day);
    expect(closed.statusCode).toBe(201);
    expect(closed.json().dayClose.summary.report.sales.orderCount).toBe(1);
    expect(closed.json()).toMatchObject({ openDrafts: [], paidAfterClose: [] });
  });
});

describe("an order paid into a day already closed", () => {
  it("is taken, kept out of the day's report, and listed beside the close", async () => {
    const day = "2026-10-18";
    const before = await draftOn(s.tillA, day);
    expect(await paid(s.tillA, before, day)).toBe("accepted");
    const closed = await closeDay(day);
    expect(closed.statusCode).toBe(201);
    const frozen = closed.json().dayClose.summary.report.sales;
    expect(frozen.orderCount).toBe(1);

    // A till that was offline at the close saved and settled a table of that day after it.
    const late = await draftOn(s.tillB, day);
    expect(await paid(s.tillB, late, day)).toBe("accepted");

    expect(await salesOf(day)).toEqual(frozen);
    expect((await dayOf(day)).paidAfterClose).toEqual([
      {
        id: late,
        deviceId: s.tillB.deviceId,
        deviceOrderNo: expect.any(Number),
        refundOfOrderId: null,
      },
    ]);
  });
});
