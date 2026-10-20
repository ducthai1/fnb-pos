import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { areaWithTables } from "../support/floor-plan";
import { line, orderIdOf, pushOne, tillsClock } from "../support/sync-commands";
import { cancel, voidUnits } from "../support/sync-order-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";
import {
  dineIn,
  markPreBillPrinted,
  savedAgain,
  seatingOf,
  transferTable,
} from "../support/table-commands";

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

const coffee = () => line(s.menu.coffee.id);

async function freeTables(...names: string[]) {
  return (await areaWithTables(app, s.shop.managerCookie, s.shop.branchId, names)).tableIds;
}

describe("a table's status", () => {
  it("waits to pay once the pre-bill is printed, until the order changes again", async () => {
    const [table] = (await freeTables("P01")) as [string];
    const first = [coffee()];
    const opened = dineIn(s.tillA, first, { tableId: table });
    const orderId = orderIdOf(opened);
    await pushOne(app, s.tillA, opened);
    const status = async () => (await seatingOf(app, s.tillB, table))?.status;
    const steps: [string | undefined, boolean | undefined][] = [];
    const record = async (result: Awaited<ReturnType<typeof pushOne>>) =>
      steps.push([await status(), result.snapshot?.preBillPrinted]);
    await record(await pushOne(app, s.tillA, markPreBillPrinted(s.tillA, orderId)));
    const second = coffee();
    await record(await pushOne(app, s.tillA, savedAgain(s.tillA, opened, [...first, second])));
    await record(await pushOne(app, s.tillA, markPreBillPrinted(s.tillA, orderId)));
    await record(await pushOne(app, s.tillA, voidUnits(s.tillA, orderId, second.lineId, "1")));
    expect(steps).toEqual([
      ["awaiting_payment", true],
      ["occupied", false],
      ["awaiting_payment", true],
      ["occupied", false],
    ]);
  });

  it("keeps waiting to pay when the guests move, since moving changes no amount", async () => {
    const [from, to] = (await freeTables("P02", "P03")) as [string, string];
    const opened = dineIn(s.tillA, [coffee()], { tableId: from });
    await pushOne(app, s.tillA, opened);
    await pushOne(app, s.tillA, markPreBillPrinted(s.tillA, orderIdOf(opened)));
    const moved = await pushOne(app, s.tillA, transferTable(s.tillA, orderIdOf(opened), to));
    expect(moved.snapshot?.preBillPrinted).toBe(true);
    expect(await seatingOf(app, s.tillA, to)).toEqual({
      status: "awaiting_payment",
      orderId: orderIdOf(opened),
    });
  });

  it("is not set by a pre-bill of a closed order or of another branch's order", async () => {
    const [table] = (await freeTables("P04")) as [string];
    const open = dineIn(s.tillA, [coffee()], { tableId: table });
    const closed = dineIn(s.tillA, [coffee()]);
    await pushOne(app, s.tillA, open);
    await pushOne(app, s.tillA, closed);
    await pushOne(app, s.tillA, cancel(s.tillA, orderIdOf(closed)));
    const codes = [
      await pushOne(app, s.tillA, markPreBillPrinted(s.tillA, orderIdOf(closed))),
      await pushOne(app, s.otherBranchTill, markPreBillPrinted(s.otherBranchTill, orderIdOf(open))),
    ].map((result) => result.code);
    expect(codes).toEqual(["DOMAIN_ORDER_ALREADY_CANCELLED", "SYNC_ORDER_NOT_FOUND"]);
    expect((await seatingOf(app, s.tillA, table))?.status).toBe("occupied");
  });
});
