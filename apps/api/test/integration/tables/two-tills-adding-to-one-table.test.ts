import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { type LineIntent, line, pushOne, tillsClock } from "../support/sync-commands";
import { type SyncShop, type Till, syncShop } from "../support/sync-shop";
import { type ShopFloor, dineIn, savedAgain, shopFloor } from "../support/table-commands";

const info = inject("testPostgres");
const STALE = "SYNC_ORDER_VERSION_STALE";

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
const peachTea = () => line(s.menu.peachTea.id, { variantId: s.menu.peachTea.sizeM });

type Draft = ReturnType<typeof dineIn>;
const expecting = (sent: Draft, expectedVersion: number): Draft => ({
  ...sent,
  payload: { ...(sent.payload as object), expectedVersion },
});

/** `till` saves the table's draft with `lines`, edited from `version` (or from nothing said). */
const saveAt = (till: Till, opened: Draft, lines: LineIntent[], version?: number) => {
  const again = savedAgain(till, opened, lines);
  return pushOne(app, till, version === undefined ? again : expecting(again, version));
};

const lineIdsOf = (snapshot: unknown) =>
  ((snapshot as { lines: { id: string; lineType: string }[] }).lines ?? [])
    .filter((each) => each.lineType === "item")
    .map((each) => each.id)
    .sort();

/** A table opened on till A with one coffee; answers the draft and the version both tills hold. */
async function openedTable(tableId: string) {
  const first = [coffee()];
  const opened = dineIn(s.tillA, first, { tableId });
  const result = await pushOne(app, s.tillA, opened);
  expect(result.status).toBe("accepted");
  return { opened, first, version: result.snapshot?.version as number };
}

describe("two tills adding to one table, each from the version it saw", () => {
  it("refuses the later till, keeps what the first added, and takes the later one redone on the new version", async () => {
    const { opened, first, version } = await openedTable(floor.tables.B01);
    const fromA = peachTea();
    const fromB = coffee();
    const a = await saveAt(s.tillA, opened, [...first, fromA], version);
    expect(a.status).toBe("accepted");
    const b = await saveAt(s.tillB, opened, [...first, fromB], version);
    expect({ status: b.status, code: b.code }).toEqual({ status: "rejected", code: STALE });
    // The refusal carries the order as it stands, with what till A added.
    expect(lineIdsOf(b.snapshot)).toEqual([first[0]!.lineId, fromA.lineId].sort());
    const current = b.snapshot?.version as number;
    const redone = await saveAt(s.tillB, opened, [...first, fromA, fromB], current);
    expect(redone.status).toBe("accepted");
    expect(lineIdsOf(redone.snapshot)).toEqual(
      [first[0]!.lineId, fromA.lineId, fromB.lineId].sort(),
    );
  });

  it("lets only one of two saves over the same version through when they arrive together", async () => {
    const { opened, first, version } = await openedTable(floor.tables.B02);
    const [a, b] = await Promise.all([
      saveAt(s.tillA, opened, [...first, peachTea()], version),
      saveAt(s.tillB, opened, [...first, coffee()], version),
    ]);
    expect([a?.status, b?.status].sort()).toEqual(["accepted", "rejected"]);
    expect([a?.code, b?.code]).toContain(STALE);
  });

  it("opens an order expected not to exist yet, and refuses one expected at a version it never had", async () => {
    const fresh = expecting(dineIn(s.tillA, [coffee()], { tableId: floor.tables.B03 }), 0);
    expect((await pushOne(app, s.tillA, fresh)).status).toBe("accepted");
    const imagined = expecting(dineIn(s.tillA, [coffee()], { tableId: floor.tables.B04 }), 3);
    const refused = await pushOne(app, s.tillA, imagined);
    expect({ status: refused.status, code: refused.code }).toEqual({
      status: "rejected",
      code: STALE,
    });
  });
});

describe("a till that sends no version", () => {
  it("still replaces the draft as before, which drops what the other till had not sent to the bar", async () => {
    const { opened, first } = await openedTable(floor.tables.B04);
    const fromA = peachTea();
    expect((await saveAt(s.tillA, opened, [...first, fromA])).status).toBe("accepted");
    const old = await saveAt(s.tillB, opened, [...first, coffee()]);
    expect(old.status).toBe("accepted");
    expect(lineIdsOf(old.snapshot)).not.toContain(fromA.lineId);
  });
});
