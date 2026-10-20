import { withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import {
  command,
  line,
  orderIdOf,
  pay,
  push,
  pushOne,
  saveDraft,
  tillsClock,
} from "../support/sync-commands";
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

const ledger = (deviceId: string) =>
  withTenant(pool, s.shop.tenantId, async (client) => ({
    commands: (
      await client.query(
        "SELECT device_seq::int AS seq, status, code FROM applied_command WHERE device_id = $1 ORDER BY device_seq",
        [deviceId],
      )
    ).rows,
    lastSeq: (
      await client.query("SELECT last_seq::int AS n FROM device_sync_state WHERE device_id = $1", [
        deviceId,
      ])
    ).rows[0]?.n,
  }));

describe("a command sent again", () => {
  it("answers an accepted command with the stored result and applies nothing twice", async () => {
    const sent = saveDraft(s.tillA, [line(s.menu.coffee.id)]);
    const first = await pushOne(app, s.tillA, sent);
    const again = await pushOne(app, s.tillA, sent);
    const changes = await withTenant(pool, s.shop.tenantId, (client) =>
      client.query("SELECT count(*)::int AS n FROM change_log WHERE command_id = $1", [
        sent.commandId,
      ]),
    );
    expect(first.status).toBe("accepted");
    expect(again).toEqual(first);
    expect(changes.rows[0].n).toBe(1);
  });

  it("answers a rejected command with its original rejection even after the state moved on", async () => {
    const draft = saveDraft(s.tillA, [line(s.menu.coffee.id)]);
    await pushOne(app, s.tillA, draft);
    const wrongTotal = pay(s.tillA, orderIdOf(draft), 1);
    const first = await pushOne(app, s.tillA, wrongTotal);
    await pushOne(app, s.tillA, pay(s.tillA, orderIdOf(draft), 29_000));
    const again = await pushOne(app, s.tillA, wrongTotal);
    expect(first).toMatchObject({ status: "rejected", code: "DOMAIN_ORDER_TOTAL_MISMATCH" });
    expect(first.snapshot?.status).toBe("draft");
    expect(again).toEqual(first);
  });
});

describe("the order of a till's commands", () => {
  it("tells a command ahead of the next expected one to retry and stores nothing", async () => {
    const before = await ledger(s.tillA.deviceId);
    s.tillA.nextSeq += 1;
    const ahead = saveDraft(s.tillA, [line(s.menu.coffee.id)]);
    const result = await pushOne(app, s.tillA, ahead);
    s.tillA.nextSeq -= 2;
    expect(result).toEqual({
      commandId: ahead.commandId,
      status: "retry",
      code: "SYNC_OUT_OF_ORDER",
    });
    expect(await ledger(s.tillA.deviceId)).toEqual(before);
  });

  it("refuses an unknown command that reuses an applied device_seq, without storing it", async () => {
    await pushOne(app, s.tillA, saveDraft(s.tillA, [line(s.menu.coffee.id)]));
    const before = await ledger(s.tillA.deviceId);
    s.tillA.nextSeq -= 1;
    const reused = saveDraft(s.tillA, [line(s.menu.coffee.id)]);
    const result = await pushOne(app, s.tillA, reused);
    expect(result).toEqual({
      commandId: reused.commandId,
      status: "rejected",
      code: "SYNC_DEVICE_SEQ_REUSED",
    });
    expect(await ledger(s.tillA.deviceId)).toEqual(before);
  });

  it("answers each command after a gap in one batch with retry", async () => {
    const applied = saveDraft(s.tillB, [line(s.menu.coffee.id)]);
    s.tillB.nextSeq += 1;
    const afterGap = [saveDraft(s.tillB, [line(s.menu.coffee.id)]), saveDraft(s.tillB, [])];
    const results = await push(app, s.tillB, [applied, ...afterGap]);
    s.tillB.nextSeq = applied.deviceSeq + 1;
    expect(results.map((result) => result.status)).toEqual(["accepted", "retry", "retry"]);
  });
});

describe("what a command is checked against before it runs", () => {
  it("accepts a till on the oldest supported rules and stores a rejection for older ones", async () => {
    const current = await pushOne(app, s.otherBranchTill, saveDraft(s.otherBranchTill, []));
    const outdated = [
      command(s.otherBranchTill, "order.save_draft", {}, { domainVersion: "0.0.9" }),
      command(s.otherBranchTill, "order.save_draft", {}, { domainVersion: "v0.1.0" }),
    ];
    const results = await push(app, s.otherBranchTill, outdated);
    expect(current.status).toBe("accepted");
    expect(results.map((result) => result.code)).toEqual([
      "SYNC_DOMAIN_VERSION_UNSUPPORTED",
      "SYNC_DOMAIN_VERSION_UNSUPPORTED",
    ]);
    expect((await ledger(s.otherBranchTill.deviceId)).lastSeq).toBe(s.otherBranchTill.nextSeq - 1);
  });

  it("stores a rejection for an unknown command type and for a payload that does not parse", async () => {
    const results = await push(app, s.otherBranchTill, [
      command(s.otherBranchTill, "order.teleport", {}),
      command(s.otherBranchTill, "order.pay", { orderId: "not-a-uuid" }),
    ]);
    expect(results.map((result) => [result.status, result.code])).toEqual([
      ["rejected", "SYNC_UNKNOWN_COMMAND_TYPE"],
      ["rejected", "SYNC_INVALID_PAYLOAD"],
    ]);
  });
});
