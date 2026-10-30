import { withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { applySyncCommand } from "../../../src/sync/apply-sync-command";
import { readCommandTime } from "../../../src/sync/command-time";
import { SYNC_COMMANDS } from "../../../src/sync/sync-command-registry";
import { CommandRejection } from "../../../src/sync/sync-error-codes";
import type { SyncCommandEnvelope } from "../../../src/sync/sync-wire-types";
import { areaWithTables } from "../support/floor-plan";
import {
  latestOrders,
  line,
  orderIdOf,
  pullAll,
  pushOne,
  tillsClock,
} from "../support/sync-commands";
import { senderOf, untilSettledOrWaitingOnLock } from "../support/sync-feed-probes";
import { type SyncShop, type Till, syncShop } from "../support/sync-shop";
import { dineIn, seatingOf } from "../support/table-commands";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app"), max: 12 });
  app = buildApp({ pool, clock: tillsClock() });
  s = await syncShop(app, pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const coffee = () => line(s.menu.coffee.id);

const freeTable = async (name: string) =>
  (await areaWithTables(app, s.shop.managerCookie, s.shop.branchId, [name])).tableIds[0]!;

/**
 * Runs `work` in a transaction of its own that stays open, uncommitted, until the returned
 * release is called: the moment where one till has seated its guests and not yet committed.
 */
async function heldOpen<T>(work: (client: pg.PoolClient) => Promise<T>) {
  let release!: () => void;
  let inside!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  const entered = new Promise<void>((resolve) => (inside = resolve));
  const committed = withTenant(pool, s.shop.tenantId, async (client) => {
    const result = await work(client);
    inside();
    await held;
    return result;
  });
  await entered;
  return { release, committed };
}

/** Resolves once some session waits for another transaction to end, or `pending` settled. */
async function untilWaitingOnAnotherTransaction(pending: Promise<unknown>) {
  let settled = false;
  pending.then(
    () => (settled = true),
    () => (settled = true),
  );
  for (let attempt = 0; attempt < 2_000; attempt++) {
    if (settled) return;
    const { rows } = await pool.query(
      "SELECT count(*)::int AS n FROM pg_stat_activity " +
        "WHERE wait_event_type = 'Lock' AND wait_event = 'transactionid'",
    );
    if (rows[0].n > 0) return;
  }
  throw new Error("the second till neither finished nor waited for the first");
}

/**
 * The order command's own handler, run without the sync path that wraps it. That path is
 * what records the till's device_seq, so the number the command drew is given back.
 */
async function handlerOnly(client: pg.PoolClient, till: Till, sent: SyncCommandEnvelope) {
  till.nextSeq -= 1;
  const sender = await senderOf(pool, s, till);
  const reading = readCommandTime(sent.createdAt, sender.receivedAt, sender.branch);
  if (!reading.ok) throw new Error("the till's clock is ahead of the server's");
  const context = { ...sender, client, command: sent, time: reading.time, answer: {} };
  return SYNC_COMMANDS.get(sent.type)!.apply(context, sent.payload);
}

describe("two tills opening one table at the same moment", () => {
  it("seats the first and refuses the second, which waited for it, without overwriting", async () => {
    const table = await freeTable("Đ01");
    const first = dineIn(s.tillA, [coffee(), coffee()], { tableId: table });
    const second = dineIn(s.tillB, [coffee()], { tableId: table });
    const senderA = await senderOf(pool, s, s.tillA);
    const a = await heldOpen((client) => applySyncCommand(client, senderA, first));
    const pushingB = pushOne(app, s.tillB, second);
    await untilSettledOrWaitingOnLock(pool, pushingB);
    a.release();
    const [resultA, resultB] = await Promise.all([a.committed, pushingB]);
    expect([resultA.status, resultB.status, resultB.code]).toEqual([
      "accepted",
      "rejected",
      "SYNC_TABLE_OCCUPIED",
    ]);
    const orders = latestOrders((await pullAll(app, s.tillB)).changes);
    expect(orders.get(orderIdOf(first))?.lines).toHaveLength(2);
    expect(orders.has(orderIdOf(second))).toBe(false);
    expect(await seatingOf(app, s.tillB, table)).toEqual({
      status: "occupied",
      orderId: orderIdOf(first),
    });
  });

  it("lets exactly one of two pushes sent together hold the table", async () => {
    const table = await freeTable("Đ02");
    const sent = [
      dineIn(s.tillA, [coffee()], { tableId: table }),
      dineIn(s.tillB, [coffee()], { tableId: table }),
    ];
    const results = await Promise.all([
      pushOne(app, s.tillA, sent[0]!),
      pushOne(app, s.tillB, sent[1]!),
    ]);
    const winner = results.findIndex((result) => result.status === "accepted");
    expect(results.map((result) => result.code ?? result.status).sort()).toEqual([
      "SYNC_TABLE_OCCUPIED",
      "accepted",
    ]);
    expect((await seatingOf(app, s.tillA, table))?.orderId).toBe(orderIdOf(sent[winner]!));
  });

  it("is refused by the database itself, even past the sync path's ordering", async () => {
    const table = await freeTable("Đ03");
    const first = dineIn(s.tillA, [coffee()], { tableId: table });
    const second = dineIn(s.tillB, [coffee()], { tableId: table });
    const a = await heldOpen((client) => handlerOnly(client, s.tillA, first));
    const savingB = withTenant(pool, s.shop.tenantId, (client) =>
      handlerOnly(client, s.tillB, second),
    ).then(
      () => "saved",
      (error: unknown) => (error instanceof CommandRejection ? error.code : String(error)),
    );
    await untilWaitingOnAnotherTransaction(savingB);
    a.release();
    await a.committed;
    expect(await savingB).toBe("SYNC_TABLE_OCCUPIED");
    expect((await seatingOf(app, s.tillA, table))?.orderId).toBe(orderIdOf(first));
  });
});
