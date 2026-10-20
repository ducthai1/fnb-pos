import { dailySalesReportSchema } from "@fnb/contracts";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { ManualClock } from "../support/manual-clock";
import { BUSINESS_DATE, line, orderIdOf, pay, pushOne, saveDraft } from "../support/sync-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");
/** 03:30 on the 21st in Vietnam: still the business day of the 20th, which starts at 04:00. */
const SYNCED_AT = new Date("2026-10-20T20:30:00.000Z");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool, clock: new ManualClock(SYNCED_AT) });
  s = await syncShop(app, pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

/** A coffee (29.000 đ) sold and paid in cash at `paidAt`, the till's time. */
async function coffeeSoldAt(paidAt: string) {
  const draft = { ...saveDraft(s.tillA, [line(s.menu.coffee.id)]), createdAt: paidAt };
  expect((await pushOne(app, s.tillA, draft)).status).toBe("accepted");
  const paid = { ...pay(s.tillA, orderIdOf(draft), 29_000), createdAt: paidAt };
  expect((await pushOne(app, s.tillA, paid)).status).toBe("accepted");
}

describe("the daily sales report of a shop open late", () => {
  it("lists its hours in the order of the business day: the small hours last", async () => {
    await coffeeSoldAt("2026-10-20T11:10:00.000Z"); // 18:10 on the 20th
    await coffeeSoldAt("2026-10-20T18:20:00.000Z"); // 01:20 on the 21st
    await coffeeSoldAt("2026-10-20T16:30:00.000Z"); // 23:30 on the 20th
    await coffeeSoldAt("2026-10-20T20:05:00.000Z"); // 03:05 on the 21st, the day's last hour
    const report = dailySalesReportSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: `/reports/daily-sales?branchId=${s.shop.branchId}&businessDate=${BUSINESS_DATE}`,
          headers: { cookie: s.shop.managerCookie },
        })
      ).json(),
    );
    expect(report.byHour.map((row) => row.hour)).toEqual([18, 23, 1, 3]);
    expect(report.byHour.every((row) => row.orderCount === 1)).toBe(true);
  });
});
