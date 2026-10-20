import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import type { ManualClock } from "../support/manual-clock";
import { RECORDED_AT, line, pullAll, pushOne, tillsClock } from "../support/sync-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";
import {
  type ShopFloor,
  dineIn,
  markPreBillPrinted,
  occupancy,
  savedAgain,
  shopFloor,
} from "../support/table-commands";

const info = inject("testPostgres");
const HOUR = 3_600_000;

let pool: pg.Pool;
let clock: ManualClock;
let app: FastifyInstance;
let s: SyncShop;
let floor: ShopFloor;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  clock = tillsClock();
  app = buildApp({ pool, clock });
  s = await syncShop(app, pool);
  floor = await shopFloor(app, s);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const coffee = () => line(s.menu.coffee.id);

describe("a table's order", () => {
  it("says when it was opened by the till's time the server accepts, not when it synced", async () => {
    const opened = dineIn(s.tillA, [coffee()], { tableId: floor.tables.B01 });
    // Opened while offline; the till syncs two hours later.
    clock.advance(2 * HOUR);
    const result = await pushOne(app, s.tillA, opened);
    expect(result.snapshot?.openedAt).toBe(RECORDED_AT);
    expect((await occupancy(app, s.tillB)).get(floor.tables.B01)?.openedAt).toBe(RECORDED_AT);
    // A till that only pulls the order learns the same time.
    const pulled = (await pullAll(app, s.tillB)).changes.filter(
      (change) => change.entity === "order" && change.entityId === result.snapshot?.id,
    );
    expect(pulled.at(-1)?.snapshot).toMatchObject({ openedAt: RECORDED_AT });
  });

  it("keeps when it was opened when saved again, and a time a till set too far back is kept in bounds", async () => {
    const early = new Date(clock.now().getTime() - 20 * HOUR).toISOString();
    const opened = {
      ...dineIn(s.tillA, [coffee()], { tableId: floor.tables.B02 }),
      createdAt: early,
    };
    const first = await pushOne(app, s.tillA, opened);
    const bound = new Date(clock.now().getTime() - 12 * HOUR).toISOString();
    expect(first.snapshot?.openedAt).toBe(bound);
    clock.advance(HOUR);
    const again = await pushOne(app, s.tillA, savedAgain(s.tillA, opened, [coffee(), coffee()]));
    expect(again.snapshot?.openedAt).toBe(bound);
  });

  it("names the version its pre-bill was printed for, so every till tells it changed since", async () => {
    const opened = dineIn(s.tillA, [coffee()], { tableId: floor.tables.B03 });
    const first = await pushOne(app, s.tillA, opened);
    expect(first.snapshot).toMatchObject({ preBillPrinted: false, preBillPrintedVersion: null });
    const orderId = first.snapshot?.id as string;
    const printed = await pushOne(app, s.tillA, markPreBillPrinted(s.tillA, orderId));
    const printedFor = printed.snapshot?.version;
    expect(printed.snapshot).toMatchObject({
      preBillPrinted: true,
      preBillPrintedVersion: printedFor,
    });
    const more = await pushOne(app, s.tillB, savedAgain(s.tillB, opened, [coffee(), coffee()]));
    expect(more.snapshot).toMatchObject({
      preBillPrinted: false,
      preBillPrintedVersion: printedFor,
    });
    expect(more.snapshot?.version).toBeGreaterThan(printedFor as number);
  });
});
