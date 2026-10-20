import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { line, pushOne } from "../support/sync-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";
import {
  type ShopFloor,
  dineIn,
  occupancy,
  savedAgain,
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

describe("a counter order with a table tag", () => {
  it("carries the table number to bring it to, and takes no table", async () => {
    const result = await pushOne(app, s.tillA, dineIn(s.tillA, [coffee()], { tableTag: "B01" }));
    expect(result.snapshot).toMatchObject({ tableTag: "B01", tableId: null, tableName: null });
    const floorScreen = await occupancy(app, s.tillA);
    expect(Object.values(floor.tables).map((id) => floorScreen.get(id)?.status)).toEqual([
      "free",
      "free",
      "free",
      "free",
    ]);
    // The table the tag names is still free for guests to sit at.
    const seated = dineIn(s.tillB, [coffee()], { tableId: floor.tables.B01 });
    expect((await pushOne(app, s.tillB, seated)).status).toBe("accepted");
  });

  it("may share its tag with other counter orders", async () => {
    const tagged = () => dineIn(s.tillA, [coffee()], { tableTag: "Sân 3" });
    const results = [await pushOne(app, s.tillA, tagged()), await pushOne(app, s.tillA, tagged())];
    expect(results.map((result) => result.snapshot?.tableTag)).toEqual(["Sân 3", "Sân 3"]);
  });

  it("changes or loses its tag when the draft is saved again", async () => {
    const sent = dineIn(s.tillA, [coffee()], { tableTag: "7" });
    await pushOne(app, s.tillA, sent);
    const retagged = await pushOne(
      app,
      s.tillA,
      savedAgain(s.tillA, sent, [coffee()], { tableTag: "9" }),
    );
    const cleared = await pushOne(app, s.tillA, savedAgain(s.tillA, sent, [coffee()]));
    expect([retagged.snapshot?.tableTag, cleared.snapshot?.tableTag]).toEqual(["9", null]);
  });

  it("is refused on a takeaway, and beside a table", async () => {
    const codes = [
      await pushOne(
        app,
        s.tillA,
        dineIn(s.tillA, [coffee()], { tableTag: "4", serviceType: "takeaway" }),
      ),
      await pushOne(
        app,
        s.tillA,
        dineIn(s.tillA, [coffee()], { tableTag: "4", tableId: floor.tables.B02 }),
      ),
    ].map((result) => result.code);
    expect(codes).toEqual(["SYNC_INVALID_PAYLOAD", "SYNC_INVALID_PAYLOAD"]);
    expect((await occupancy(app, s.tillA)).get(floor.tables.B02)?.status).toBe("free");
  });
});
