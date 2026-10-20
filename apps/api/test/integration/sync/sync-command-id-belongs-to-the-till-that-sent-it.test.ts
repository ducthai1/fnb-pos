import { withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { freshTill } from "../support/shift-commands";
import { line, orderIdOf, pushOne, saveDraft, tillsClock } from "../support/sync-commands";
import { type SyncShop, type Till, syncShop } from "../support/sync-shop";

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

const inShop = <T>(sql: string, values: unknown[]) =>
  withTenant(
    pool,
    s.shop.tenantId,
    async (client) => (await client.query(sql, values)).rows as T[],
  );

const ledgerOf = (till: Till) =>
  inShop<{ seq: number; status: string; code: string | null }>(
    "SELECT device_seq::int AS seq, status, code FROM applied_command WHERE device_id = $1 " +
      "ORDER BY device_seq",
    [till.deviceId],
  );

/** Till A saves a draft; till `b` then sends a draft of its own under A's command id. */
async function clashingDrafts(b: Till) {
  const a = await freshTill(app, s);
  const first = saveDraft(a, [line(s.menu.coffee.id)]);
  expect((await pushOne(app, a, first)).status).toBe("accepted");
  const clash = { ...saveDraft(b, [line(s.menu.coffee.id)]), commandId: first.commandId };
  return { a, first, clash };
}

describe("a command id another till already used", () => {
  it("is refused on its own till's sequence, with nothing of the other till's order", async () => {
    const b = await freshTill(app, s);
    const { clash } = await clashingDrafts(b);
    const answer = await pushOne(app, b, clash);
    expect(answer).toEqual({
      commandId: clash.commandId,
      status: "rejected",
      code: "SYNC_COMMAND_ID_TAKEN",
    });
    expect(await inShop("SELECT 1 FROM sales_order WHERE id = $1", [orderIdOf(clash)])).toEqual([]);
    // The till's sequence moved past it, so its next command is taken, not stalled.
    const next = saveDraft(b, [line(s.menu.coffee.id)]);
    expect((await pushOne(app, b, next)).status).toBe("accepted");
    expect(await ledgerOf(b)).toEqual([
      { seq: 1, status: "rejected", code: "SYNC_COMMAND_ID_TAKEN" },
      { seq: 2, status: "accepted", code: null },
    ]);
  });

  it("answers the same refusal when sent again, and the first till still gets its own answer", async () => {
    const b = await freshTill(app, s);
    const { a, first, clash } = await clashingDrafts(b);
    const refused = await pushOne(app, b, clash);
    expect(await pushOne(app, b, clash)).toEqual(refused);
    const own = await pushOne(app, a, first);
    expect(own).toMatchObject({ status: "accepted", snapshot: { id: orderIdOf(first) } });
  });

  it("is refused the same way on a till of another branch", async () => {
    const elsewhere = s.otherBranchTill;
    const { clash } = await clashingDrafts(elsewhere);
    expect(await pushOne(app, elsewhere, clash)).toEqual({
      commandId: clash.commandId,
      status: "rejected",
      code: "SYNC_COMMAND_ID_TAKEN",
    });
  });
});
