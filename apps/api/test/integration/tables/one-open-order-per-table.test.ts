import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { expectStatus } from "../support/catalog-shop";
import { areaWithTables, orderSeatedAt } from "../support/floor-plan";
import { line, orderIdOf, pushOne } from "../support/sync-commands";
import { cancel } from "../support/sync-order-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";
import {
  type ShopFloor,
  dineIn,
  savedAgain,
  seatingOf,
  shopFloor,
} from "../support/table-commands";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;
let floor: ShopFloor;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool });
  s = await syncShop(app, pool);
  floor = await shopFloor(app, s);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const coffee = () => line(s.menu.coffee.id);
const peachTea = () => line(s.menu.peachTea.id, { variantId: s.menu.peachTea.sizeM });

describe("opening a table", () => {
  it("seats the order at the table under the table's name, and shows the table taken", async () => {
    const opened = dineIn(s.tillA, [coffee()], { tableId: floor.tables.B01 });
    const result = await pushOne(app, s.tillA, opened);
    expect(result.status).toBe("accepted");
    expect(result.snapshot).toMatchObject({
      tableId: floor.tables.B01,
      tableName: "B01",
      tableTag: null,
      preBillPrinted: false,
    });
    expect(await seatingOf(app, s.tillB, floor.tables.B01)).toEqual({
      status: "occupied",
      orderId: orderIdOf(opened),
    });
  });

  it("refuses a second order at the table, leaving the first one as it was", async () => {
    const first = dineIn(s.tillA, [coffee(), coffee()], { tableId: floor.tables.B02 });
    const kept = await pushOne(app, s.tillA, first);
    const second = await pushOne(
      app,
      s.tillB,
      dineIn(s.tillB, [peachTea()], { tableId: floor.tables.B02 }),
    );
    expect({ status: second.status, code: second.code, snapshot: second.snapshot }).toEqual({
      status: "rejected",
      code: "SYNC_TABLE_OCCUPIED",
      snapshot: undefined,
    });
    // Another round on the first order still goes through, so nothing of it was replaced.
    const again = await pushOne(app, s.tillA, savedAgain(s.tillA, first, [coffee()]));
    expect(again.status).toBe("accepted");
    expect(again.snapshot?.version).toBe((kept.snapshot?.version ?? 0) + 1);
    expect(await seatingOf(app, s.tillB, floor.tables.B02)).toMatchObject({
      orderId: orderIdOf(first),
    });
  });

  it("frees the table once its order is closed", async () => {
    const first = dineIn(s.tillA, [coffee()], { tableId: floor.tables.B03 });
    await pushOne(app, s.tillA, first);
    await pushOne(app, s.tillA, cancel(s.tillA, orderIdOf(first)));
    expect(await seatingOf(app, s.tillA, floor.tables.B03)).toEqual({
      status: "free",
      orderId: null,
    });
    const next = await pushOne(
      app,
      s.tillB,
      dineIn(s.tillB, [coffee()], { tableId: floor.tables.B03 }),
    );
    expect(next.status).toBe("accepted");
  });

  it("refuses a table of another branch, an unknown one and an archived one", async () => {
    const archived = await answerOfArchivedTable();
    const codes = [
      await pushOne(app, s.tillA, dineIn(s.tillA, [coffee()], { tableId: floor.otherBranchTable })),
      await pushOne(app, s.tillA, dineIn(s.tillA, [coffee()], { tableId: floor.areaId })),
      archived,
    ].map((result) => result.code);
    expect(codes).toEqual(["SYNC_TABLE_NOT_FOUND", "SYNC_TABLE_NOT_FOUND", "SYNC_TABLE_ARCHIVED"]);
  });
});

/** Opens B04 after the backoffice archived it (an earlier order sat there). */
async function answerOfArchivedTable() {
  await orderSeatedAt(
    pool,
    { tenantId: s.shop.tenantId, branchId: s.shop.branchId, deviceId: s.shop.deviceId },
    floor.tables.B04,
    "cancelled",
  );
  await expectStatus(
    app.inject({
      method: "DELETE",
      url: `/floor/tables/${floor.tables.B04}`,
      headers: { cookie: s.shop.managerCookie },
    }),
    200,
  );
  return pushOne(app, s.tillA, dineIn(s.tillA, [coffee()], { tableId: floor.tables.B04 }));
}

describe("saving a table's draft again", () => {
  it("keeps it at its table, and refuses to seat, move or unseat it that way", async () => {
    const { tableIds } = await areaWithTables(app, s.shop.managerCookie, s.shop.branchId, [
      "B05",
      "B06",
    ]);
    const [b05, b06] = tableIds as [string, string];
    const seated = dineIn(s.tillA, [coffee()], { tableId: b05 });
    const counter = dineIn(s.tillA, [coffee()]);
    await pushOne(app, s.tillA, seated);
    await pushOne(app, s.tillA, counter);
    const results = [
      await pushOne(app, s.tillA, savedAgain(s.tillA, seated, [coffee(), coffee()])),
      await pushOne(app, s.tillA, savedAgain(s.tillA, seated, [coffee()], { tableId: b06 })),
      await pushOne(app, s.tillA, savedAgain(s.tillA, seated, [coffee()], { tableId: null })),
      await pushOne(app, s.tillA, savedAgain(s.tillA, counter, [coffee()], { tableId: b06 })),
    ];
    expect(results.map((result) => result.code ?? result.status)).toEqual([
      "accepted",
      "SYNC_TABLE_CHANGE_NEEDS_TRANSFER",
      "SYNC_TABLE_CHANGE_NEEDS_TRANSFER",
      "SYNC_TABLE_CHANGE_NEEDS_TRANSFER",
    ]);
    expect(results[0]?.snapshot?.lines).toHaveLength(2);
    expect([await seatingOf(app, s.tillA, b05), await seatingOf(app, s.tillA, b06)]).toEqual([
      { status: "occupied", orderId: orderIdOf(seated) },
      { status: "free", orderId: null },
    ]);
  });
});
