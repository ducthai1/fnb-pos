import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { areaWithTables, orderSeatedAt } from "../support/floor-plan";
import { approve, hireManager, justNow, signInAs } from "../support/sync-approvals";
import { line, orderIdOf, pushOne, tillsClock } from "../support/sync-commands";
import { cancel, markSent } from "../support/sync-order-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";
import {
  type ShopFloor,
  dineIn,
  occupancy,
  seatingOf,
  shopFloor,
  transferTable,
} from "../support/table-commands";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;
let floor: ShopFloor;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool, clock: tillsClock() });
  s = await syncShop(app, pool);
  floor = await shopFloor(app, s);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const coffee = () => line(s.menu.coffee.id);

/** Fresh tables of the shop's branch, so each test starts from free ones. */
async function freeTables(...names: string[]) {
  const made = await areaWithTables(app, s.shop.managerCookie, s.shop.branchId, names, "Sân");
  return made.tableIds;
}

/** An order of till A opened at `tableId`, with the snapshot it was answered with. */
async function seatedAt(tableId: string, lines = [coffee()]) {
  const sent = dineIn(s.tillA, lines, { tableId });
  const result = await pushOne(app, s.tillA, sent);
  if (result.status !== "accepted") throw new Error(`opening answered ${result.code}`);
  return { orderId: orderIdOf(sent), lineIds: lines.map((item) => item.lineId) };
}

describe("table.transfer", () => {
  it("moves the guests to a free table, keeping each line and what the bar already has", async () => {
    const [from, to] = (await freeTables("S01", "S02")) as [string, string];
    const order = await seatedAt(from, [coffee(), coffee()]);
    await markSent(pool, s.shop.tenantId, order.lineIds[0]!, "1");
    const openedAt = (await occupancy(app, s.tillA)).get(from)?.openedAt;
    const moved = await pushOne(app, s.tillB, transferTable(s.tillB, order.orderId, to));
    expect(moved.status).toBe("accepted");
    expect(moved.snapshot).toMatchObject({ tableId: to, tableName: "S02", tableTag: null });
    expect(moved.snapshot?.lines.map((item) => [item.id, item.sentQuantity])).toEqual([
      [order.lineIds[0], "1"],
      [order.lineIds[1], "0"],
    ]);
    const after = await occupancy(app, s.tillA);
    expect([after.get(from)?.status, after.get(to)]).toEqual([
      "free",
      expect.objectContaining({ status: "occupied", orderId: order.orderId, openedAt }),
    ]);
  });

  it("refuses a table that already has guests, leaving both orders where they were", async () => {
    const [left, right] = (await freeTables("S03", "S04")) as [string, string];
    const first = await seatedAt(left);
    const second = await seatedAt(right);
    const merged = await pushOne(app, s.tillA, transferTable(s.tillA, first.orderId, right));
    expect(merged.code).toBe("SYNC_TABLE_OCCUPIED");
    expect([await seatingOf(app, s.tillA, left), await seatingOf(app, s.tillA, right)]).toEqual([
      { status: "occupied", orderId: first.orderId },
      { status: "occupied", orderId: second.orderId },
    ]);
  });

  it("refuses the order's own table, an archived table and one of another branch", async () => {
    const [here, gone] = (await freeTables("S05", "S06")) as [string, string];
    const order = await seatedAt(here);
    await orderSeatedAt(pool, s.shop, gone, "cancelled");
    await app.inject({
      method: "DELETE",
      url: `/floor/tables/${gone}`,
      headers: { cookie: s.shop.managerCookie },
    });
    const codes = [];
    for (const target of [here, gone, floor.otherBranchTable]) {
      codes.push((await pushOne(app, s.tillA, transferTable(s.tillA, order.orderId, target))).code);
    }
    expect(codes).toEqual(["SYNC_TABLE_OCCUPIED", "SYNC_TABLE_ARCHIVED", "SYNC_TABLE_NOT_FOUND"]);
    expect(await seatingOf(app, s.tillA, here)).toEqual({
      status: "occupied",
      orderId: order.orderId,
    });
  });

  it("refuses an order that sits at no table, and one already closed", async () => {
    const [target, closedAt] = (await freeTables("S07", "S08")) as [string, string];
    const counter = dineIn(s.tillA, [coffee()]);
    await pushOne(app, s.tillA, counter);
    const closed = await seatedAt(closedAt);
    await pushOne(app, s.tillA, cancel(s.tillA, closed.orderId));
    const codes = [
      (await pushOne(app, s.tillA, transferTable(s.tillA, orderIdOf(counter), target))).code,
      (await pushOne(app, s.tillA, transferTable(s.tillA, closed.orderId, target))).code,
    ];
    expect(codes).toEqual(["SYNC_ORDER_NOT_AT_TABLE", "DOMAIN_ORDER_ALREADY_CANCELLED"]);
    expect(await seatingOf(app, s.tillA, target)).toEqual({ status: "free", orderId: null });
  });

  it("needs transfer_table, or a manager's approval of the move", async () => {
    const [from, to] = (await freeTables("S09", "S10")) as [string, string];
    const order = await seatedAt(from);
    const managerId = await hireManager(app, s);
    await signInAs(app, s, s.tillB, "barista");
    const alone = await pushOne(app, s.tillB, transferTable(s.tillB, order.orderId, to));
    const approvalId = await approve(app, s.tillB, managerId, { key: "transfer_table" });
    const approved = await pushOne(app, s.tillB, {
      ...transferTable(s.tillB, order.orderId, to, approvalId),
      createdAt: justNow(),
    });
    expect([alone.code, approved.status]).toEqual(["SYNC_APPROVAL_REQUIRED", "accepted"]);
    expect(await seatingOf(app, s.tillA, to)).toEqual({
      status: "occupied",
      orderId: order.orderId,
    });
  });
});
