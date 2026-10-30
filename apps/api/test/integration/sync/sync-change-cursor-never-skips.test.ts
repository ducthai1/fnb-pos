import { withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { applySyncCommand } from "../../../src/sync/apply-sync-command";
import type { SyncChange } from "../../../src/sync/sync-wire-types";
import {
  line,
  orderIdOf,
  pull,
  pullAll,
  push,
  pushOne,
  saveDraft,
  tillsClock,
} from "../support/sync-commands";
import {
  moveChangeSeqBelowADigitBoundary,
  senderOf,
  untilSettledOrWaitingOnLock,
} from "../support/sync-feed-probes";
import { provisionScratchDatabase } from "../support/provisioned-scratch-database";
import { type SyncShop, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;
let otherShop: SyncShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool, clock: tillsClock() });
  s = await syncShop(app, pool);
  otherShop = await syncShop(app, pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const orderIds = (changes: readonly SyncChange[]) => changes.map((change) => change.entityId);

describe("a till pulling while another till's command is still committing", () => {
  it("receives the change that drew its number first but committed last", async () => {
    const start = (await pullAll(app, s.tillA)).cursor;
    let release!: () => void;
    let drawn!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const inside = new Promise<void>((resolve) => (drawn = resolve));
    const first = saveDraft(s.tillA, [line(s.menu.coffee.id)]);
    const second = saveDraft(s.tillB, [line(s.menu.coffee.id)]);
    const sender = await senderOf(pool, s, s.tillA);
    // Till A's command has drawn its change_seq and stays uncommitted until released.
    const committingA = withTenant(pool, s.shop.tenantId, async (client) => {
      const result = await applySyncCommand(client, sender, first);
      drawn();
      await held;
      return result;
    });
    await inside;
    // Till B touches no row of A's: different till, different order.
    const pushingB = push(app, s.tillB, [second]);
    await untilSettledOrWaitingOnLock(pool, pushingB);
    const during = await pull(app, s.tillA, start);
    release();
    await Promise.all([committingA, pushingB]);
    const after = await pullAll(app, s.tillA, during.nextCursor);
    expect([...orderIds(during.changes), ...orderIds(after.changes)]).toEqual([
      orderIdOf(first),
      orderIdOf(second),
    ]);
  });
});

describe("paging through the feed", () => {
  // The sequence behind change_seq is shared by every test file running at once. Moving it to
  // the edge of a digit boundary there left no margin against their draws, and a retry had
  // to draw ten times as many numbers (millions, each a call), which timed out on a loaded
  // machine. A database of its own has a sequence nobody else draws from.
  it("follows change_seq as a number once it gains a digit", async () => {
    const scratch = await provisionScratchDatabase(info);
    const ownPool = new pg.Pool({ connectionString: scratch.appUrl });
    const ownApp = buildApp({ pool: ownPool, clock: tillsClock() });
    try {
      const own = await syncShop(ownApp, ownPool);
      const start = (await pullAll(ownApp, own.tillA)).cursor;
      await moveChangeSeqBelowADigitBoundary(ownPool, 10);
      const drafts = Array.from({ length: 20 }, () =>
        saveDraft(own.tillA, [line(own.menu.coffee.id)]),
      );
      await push(ownApp, own.tillA, drafts);
      const pages = await pullAll(ownApp, own.tillA, start, 2);
      const seqs = pages.changes.map((change) => change.changeSeq);
      expect(orderIds(pages.changes)).toEqual(drafts.map(orderIdOf));
      expect(new Set(seqs.map((seq) => seq.length)).size).toBe(2);
      expect(seqs.map(Number)).toEqual([...seqs.map(Number)].sort((x, y) => x - y));
    } finally {
      await ownApp.close();
      await ownPool.end();
      await scratch.drop();
    }
  });

  it("answers an empty page with the cursor it was sent", async () => {
    const { cursor } = await pullAll(app, s.tillA);
    expect(await pull(app, s.tillA, cursor)).toEqual({ changes: [], nextCursor: cursor });
  });
});

describe("who sees a change", () => {
  it("shows it to the tills of its branch only, never another branch's or another shop's", async () => {
    const draft = saveDraft(s.tillA, [line(s.menu.coffee.id)]);
    expect((await pushOne(app, s.tillA, draft)).status).toBe("accepted");
    const ownBranch = await pullAll(app, s.tillB);
    const otherBranch = await pullAll(app, s.otherBranchTill);
    const otherTenant = await pullAll(app, otherShop.tillA);
    expect(orderIds(ownBranch.changes)).toContain(orderIdOf(draft));
    expect(orderIds(otherBranch.changes)).not.toContain(orderIdOf(draft));
    // Menu changes of the brand reach both branches; orders only their own.
    const otherBranchOrders = otherBranch.changes.filter((c) => c.entity === "order");
    expect(
      otherBranchOrders.every(
        (c) => (c.snapshot as { branchId: string }).branchId === s.shop.otherBranchId,
      ),
    ).toBe(true);
    const ownIds = new Set(ownBranch.changes.map((c) => c.entityId));
    expect(otherTenant.changes.filter((c) => ownIds.has(c.entityId))).toEqual([]);
  });
});
