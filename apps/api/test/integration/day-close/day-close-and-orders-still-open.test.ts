import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { ManualClock } from "../support/manual-clock";
import { line, orderIdOf, pay, pushOne, saveDraft } from "../support/sync-commands";
import { cancel } from "../support/sync-order-commands";
import { type Till, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
const apps: FastifyInstance[] = [];

beforeAll(() => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
});

afterAll(async () => {
  for (const app of apps) await app.close();
  await pool.end();
});

/**
 * A shop whose API clock reads `serverAt`. The server dates a sale by when the till took
 * it, as long as that is no more than 12 hours back, and the branch's business day starts
 * at 04:00, so what a till recorded at 03:00 belongs to the night before.
 */
async function shopSyncingAt(serverAt: string) {
  const app = buildApp({ pool, clock: new ManualClock(new Date(serverAt)) });
  apps.push(app);
  const s = await syncShop(app, pool);
  const asManager = (method: "GET" | "POST", url: string, payload?: object) =>
    app.inject({
      method,
      url,
      headers: { cookie: s.shop.managerCookie },
      ...(payload === undefined ? {} : { payload }),
    });
  return {
    s,
    closeDay: (businessDate: string) =>
      asManager("POST", `/branches/${s.shop.branchId}/day-close`, { businessDate }),
    dayOf: async (businessDate: string) =>
      (
        await asManager(
          "GET",
          `/branches/${s.shop.branchId}/day-close?businessDate=${businessDate}`,
        )
      ).json(),
    salesOf: async (businessDate: string) =>
      (
        await asManager(
          "GET",
          `/reports/daily-sales?branchId=${s.shop.branchId}&businessDate=${businessDate}`,
        )
      ).json().sales,
    /** A cà phê sữa (29.000 đ) saved as a draft on `till`, which recorded it at `createdAt`. */
    draftAt: async (till: Till, createdAt: string) => {
      const sent = { ...saveDraft(till, [line(s.menu.coffee.id)]), createdAt };
      expect((await pushOne(app, till, sent)).status).toBe("accepted");
      return orderIdOf(sent);
    },
    paidAt: async (till: Till, orderId: string, createdAt: string) =>
      (await pushOne(app, till, { ...pay(till, orderId, 29_000), createdAt })).status,
    cancelAt: async (till: Till, orderId: string, createdAt: string) =>
      (await pushOne(app, till, { ...cancel(till, orderId), createdAt })).status,
  };
}

describe("closing a business day with a table still open", () => {
  it("is refused, naming the drafts of the day, and closes once they are settled", async () => {
    // 05:00 on the 20th. Drafts at 03:00 belong to the 19th, one at 04:30 to the 20th.
    const shop = await shopSyncingAt("2026-10-19T22:00:00.000Z");
    const { s } = shop;
    const day = "2026-10-19";
    const nightOfThe19th = "2026-10-19T20:00:00.000Z";
    const table = await shop.draftAt(s.tillA, nightOfThe19th);
    const left = await shop.draftAt(s.tillB, nightOfThe19th);
    // Another branch's draft, or one of another day, is not this day's business.
    await shop.draftAt(s.otherBranchTill, nightOfThe19th);
    await shop.draftAt(s.tillA, "2026-10-19T21:30:00.000Z");

    const refused = await shop.closeDay(day);
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toEqual({
      code: "API_DAY_CLOSE_DRAFTS_OPEN",
      drafts: expect.arrayContaining([
        { id: table, deviceId: s.tillA.deviceId, deviceOrderNo: expect.any(Number) },
        { id: left, deviceId: s.tillB.deviceId, deviceOrderNo: expect.any(Number) },
      ]),
    });
    expect(refused.json().drafts).toHaveLength(2);
    expect((await shop.dayOf(day)).openDrafts).toHaveLength(2);

    expect(await shop.paidAt(s.tillA, table, "2026-10-19T20:30:00.000Z")).toBe("accepted");
    expect(await shop.cancelAt(s.tillB, left, "2026-10-19T20:35:00.000Z")).toBe("accepted");
    const closed = await shop.closeDay(day);
    expect(closed.statusCode).toBe(201);
    expect(closed.json().dayClose.summary.report.sales.orderCount).toBe(1);
    expect(closed.json()).toMatchObject({ openDrafts: [], paidAfterClose: [] });
  });
});

describe("an order paid into a day already closed", () => {
  it("is taken, kept out of the day's report, and listed beside the close", async () => {
    // 05:00 on the 19th: the night of the 18th is over and closed.
    const shop = await shopSyncingAt("2026-10-18T22:00:00.000Z");
    const { s } = shop;
    const day = "2026-10-18";
    const before = await shop.draftAt(s.tillA, "2026-10-18T20:00:00.000Z");
    expect(await shop.paidAt(s.tillA, before, "2026-10-18T20:05:00.000Z")).toBe("accepted");
    const closed = await shop.closeDay(day);
    expect(closed.statusCode).toBe(201);
    const frozen = closed.json().dayClose.summary.report.sales;
    expect(frozen.orderCount).toBe(1);

    // A till that was offline at the close sold a table of that night and syncs after it.
    const late = await shop.draftAt(s.tillB, "2026-10-18T20:30:00.000Z");
    expect(await shop.paidAt(s.tillB, late, "2026-10-18T20:40:00.000Z")).toBe("accepted");

    expect(await shop.salesOf(day)).toEqual(frozen);
    expect((await shop.dayOf(day)).paidAfterClose).toEqual([
      {
        id: late,
        deviceId: s.tillB.deviceId,
        deviceOrderNo: expect.any(Number),
        refundOfOrderId: null,
      },
    ]);
  });
});
