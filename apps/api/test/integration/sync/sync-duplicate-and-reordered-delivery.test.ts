import { withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { line, orderIdOf, pay, push, saveDraft, tillsClock } from "../support/sync-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";

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

/** Applied rows, feed entries and payments the given commands left behind. */
const traces = (commandIds: string[], orderId: string) =>
  withTenant(pool, s.shop.tenantId, async (client) => {
    const count = async (sql: string, value: unknown) =>
      (await client.query(sql, [value])).rows[0].n as number;
    return {
      applied: await count(
        "SELECT count(*)::int AS n FROM applied_command WHERE command_id = ANY($1)",
        commandIds,
      ),
      changes: await count(
        "SELECT count(*)::int AS n FROM change_log WHERE command_id = ANY($1)",
        commandIds,
      ),
      payments: await count("SELECT count(*)::int AS n FROM payment WHERE order_id = $1", orderId),
    };
  });

describe("the same batch delivered twice at the same moment", () => {
  // Several rounds: a race that only loses sometimes still shows up.
  it.each([1, 2, 3, 4, 5])(
    "is applied once, and both copies get the same answer (round %i)",
    async () => {
      const draft = saveDraft(s.tillA, [line(s.menu.coffee.id)]);
      const batch = [draft, pay(s.tillA, orderIdOf(draft), 29_000)];
      const [first, second] = await Promise.all([
        push(app, s.tillA, batch),
        push(app, s.tillA, batch),
      ]);
      expect(first.map((result) => result.status)).toEqual(["accepted", "accepted"]);
      expect(second).toEqual(first);
      expect(
        await traces(
          batch.map((sent) => sent.commandId),
          orderIdOf(draft),
        ),
      ).toEqual({
        applied: 2,
        // One per command, and the shift the cash went into, sent out again with it.
        changes: 3,
        payments: 1,
      });
    },
  );
});

describe("a batch that arrives in the wrong order", () => {
  it("is told to retry, then applied in full once the till resends from the gap", async () => {
    const draft = saveDraft(s.tillB, [line(s.menu.coffee.id)]);
    const orderId = orderIdOf(draft);
    const edit = saveDraft(s.tillB, [line(s.menu.coffee.id, { quantity: "2" })], { orderId });
    const settle = pay(s.tillB, orderId, 58_000);
    const reversed = await push(app, s.tillB, [settle, edit]);
    const nothingYet = await traces(
      [draft, edit, settle].map((sent) => sent.commandId),
      orderId,
    );
    const filled = await push(app, s.tillB, [draft]);
    const rest = await push(app, s.tillB, [edit, settle]);
    // The original batch, delivered late after the till gave up on it.
    const late = await push(app, s.tillB, [draft, edit, settle]);
    expect(reversed.map((result) => result.status)).toEqual(["retry", "retry"]);
    expect(nothingYet).toEqual({ applied: 0, changes: 0, payments: 0 });
    expect([...filled, ...rest].map((result) => result.status)).toEqual([
      "accepted",
      "accepted",
      "accepted",
    ]);
    expect(late).toEqual([...filled, ...rest]);
    expect(rest[1]?.snapshot).toMatchObject({ status: "paid", version: 3 });
    expect(
      await traces(
        [draft, edit, settle].map((sent) => sent.commandId),
        orderId,
      ),
    ).toEqual({
      applied: 3,
      // One per command, and the shift the cash went into, sent out again with it.
      changes: 4,
      payments: 1,
    });
  });
});
