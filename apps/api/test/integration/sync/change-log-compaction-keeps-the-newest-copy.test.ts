import { compactTenantChangeLog, newId, withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { appendChange, lockTenantChangeFeed } from "../../../src/sync/change-feed";
import type { SyncChange } from "../../../src/sync/sync-wire-types";
import { postgresErrorCode } from "../support/postgres-error-code";
import { pull, pullAll, tillsClock } from "../support/sync-commands";
import { type SyncShop, type Till, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");
const ENTITY = "dining_table";
const INSUFFICIENT_PRIVILEGE = "42501";
const RAISE_EXCEPTION = "P0001";

let pool: pg.Pool;
let owner: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  owner = new pg.Pool({ connectionString: testConnectionString(info, "owner") });
  app = buildApp({ pool, clock: tillsClock() });
});

afterAll(async () => {
  await app.close();
  await Promise.all([pool.end(), owner.end()]);
});

beforeEach(async () => {
  s = await syncShop(app, pool);
});

/** One copy of a table appended to a branch's feed, as a write does, in its own transaction. */
async function write(branchId: string, entityId: string, snapshot: Record<string, unknown> | null) {
  await withTenant(pool, s.shop.tenantId, async (client) => {
    await lockTenantChangeFeed(client, s.shop.tenantId);
    await appendChange(client, s.shop.tenantId, {
      branchId,
      entity: ENTITY,
      entityId,
      snapshot,
      commandId: null,
    });
  });
}

const pause = () => new Promise((resolve) => setTimeout(resolve, 5));

/**
 * The database's clock between two writes: copies written before it are "old". The database
 * keeps microseconds and a JS Date milliseconds, so the moment read is a pause away from the
 * writes on both sides: a write in the same millisecond would land after the rounded moment.
 */
async function aMomentLater(): Promise<Date> {
  await pause();
  const { rows } = await pool.query<{ at: Date }>("SELECT clock_timestamp() AS at");
  await pause();
  return rows[0]!.at;
}

const compact = (olderThan: Date, batchSize = 500, maxBatchesPerTenant = 1000) =>
  compactTenantChangeLog(pool, s.shop.tenantId, { olderThan, batchSize, maxBatchesPerTenant });

/** Everything ever in the future counts as old: compact the feed as far as it goes. */
const FAR_AHEAD = new Date("2100-01-01T00:00:00.000Z");

/** What a till holds after applying `changes` on top of `held`: the newest copy of each row. */
function held(changes: readonly SyncChange[], start = new Map<string, unknown>()) {
  const copies = new Map(start);
  let last = 0n;
  for (const change of changes) {
    // The pull answers in feed order, gaps or not; a till refuses anything else.
    expect(BigInt(change.changeSeq)).toBeGreaterThan(last);
    last = BigInt(change.changeSeq);
    if (change.entity !== ENTITY) continue;
    copies.set(change.entityId, change.snapshot);
  }
  return copies;
}

const rowsOf = async (entityId: string) =>
  withTenant(pool, s.shop.tenantId, async (client) =>
    (
      await client.query<{ change_seq: string; branch_id: string; snapshot: unknown }>(
        "SELECT change_seq, branch_id, snapshot FROM change_log WHERE entity_id = $1 ORDER BY change_seq",
        [entityId],
      )
    ).rows,
  );

const copy = (name: string, version: number) => ({ id: name, name, version });
const feedOf = (till: Till, cursor = "0", limit = 500) => pullAll(app, till, cursor, limit);

describe("compacting the change feed", () => {
  it("lets a till offline for longer than the window catch up on the newest copy of everything", async () => {
    const before = await feedOf(s.tillA);
    const tables = [newId(), newId(), newId()];
    for (let version = 1; version <= 5; version++)
      for (const id of tables) await write(s.shop.branchId, id, copy(`Bàn ${version}`, version));
    const offlineFrom = before.cursor;
    const expected = held((await feedOf(s.tillA, offlineFrom)).changes);

    // The shop's own setting up left replaced copies too (its shifts, its menu): those go as well.
    expect(await compact(FAR_AHEAD)).toBeGreaterThanOrEqual(12);
    for (const id of tables) expect(await rowsOf(id)).toHaveLength(1);
    const caughtUp = await feedOf(s.tillA, offlineFrom);
    expect(held(caughtUp.changes)).toEqual(expected);
    expect(caughtUp.changes.filter((change) => change.entity === ENTITY)).toHaveLength(3);
    // A till that never pulled at all ends up the same, and the newest cursor is unchanged.
    expect(held((await feedOf(s.tillA)).changes)).toEqual(held((await feedOf(s.tillA)).changes));
    expect((await feedOf(s.tillA)).cursor).toBe(caughtUp.cursor);
  });

  it("keeps copies newer than the window, and only ever removes a copy something newer replaced", async () => {
    const id = newId();
    const lonely = newId();
    await write(s.shop.branchId, lonely, copy("Bàn một mình", 1));
    await write(s.shop.branchId, id, copy("Bàn 1", 1));
    await write(s.shop.branchId, id, copy("Bàn 2", 2));
    const cutoff = await aMomentLater();
    await write(s.shop.branchId, id, copy("Bàn 3", 3));
    await write(s.shop.branchId, id, copy("Bàn 4", 4));
    expect(await compact(cutoff)).toBe(2);
    expect((await rowsOf(id)).map((row) => row.snapshot)).toEqual([copy("Bàn 3", 3), copy("Bàn 4", 4)]);
    expect(await rowsOf(lonely)).toHaveLength(1);
    expect(await compact(cutoff)).toBe(0);
  });

  it("keeps a tombstone that is the newest copy, and drops it once the row came back", async () => {
    const archived = newId();
    const restored = newId();
    await write(s.shop.branchId, archived, copy("Bàn cũ", 1));
    await write(s.shop.branchId, restored, copy("Bàn sân", 1));
    const tillCursor = (await feedOf(s.tillA)).cursor;
    await write(s.shop.branchId, archived, null);
    await write(s.shop.branchId, restored, null);
    await write(s.shop.branchId, restored, copy("Bàn sân", 3));
    const before = held((await feedOf(s.tillA, tillCursor)).changes);

    expect(await compact(FAR_AHEAD)).toBeGreaterThanOrEqual(3);
    expect((await rowsOf(archived)).map((row) => row.snapshot)).toEqual([null]);
    expect((await rowsOf(restored)).map((row) => row.snapshot)).toEqual([copy("Bàn sân", 3)]);
    // The till that held both before sees one gone and the other back, as before compaction.
    const after = held((await feedOf(s.tillA, tillCursor)).changes);
    expect(after).toEqual(before);
    expect(after.get(archived)).toBeNull();
  });

  it("keeps each branch's newest copy of a row both branches carry", async () => {
    const shared = newId();
    for (let version = 1; version <= 3; version++) {
      await write(s.shop.branchId, shared, copy(`Q1 ${version}`, version));
      await write(s.shop.otherBranchId, shared, copy(`Q3 ${version}`, version));
    }
    // The other branch's last copy is older than this branch's: it must stay all the same.
    await write(s.shop.branchId, shared, copy("Q1 4", 4));
    expect(await compact(FAR_AHEAD)).toBeGreaterThanOrEqual(5);
    const rows = await rowsOf(shared);
    expect(rows.map((row) => [row.branch_id, row.snapshot])).toEqual([
      [s.shop.otherBranchId, copy("Q3 3", 3)],
      [s.shop.branchId, copy("Q1 4", 4)],
    ]);
    expect(held((await feedOf(s.tillA)).changes).get(shared)).toEqual(copy("Q1 4", 4));
    expect(held((await feedOf(s.otherBranchTill)).changes).get(shared)).toEqual(copy("Q3 3", 3));
  });

  it("goes in batches, and a pull racing the rounds still ends on the newest copies", async () => {
    const tables = Array.from({ length: 8 }, () => newId());
    const start = (await feedOf(s.tillA)).cursor;
    for (let version = 1; version <= 6; version++)
      for (const id of tables) await write(s.shop.branchId, id, copy(`Bàn ${version}`, version));
    const expected = held((await feedOf(s.tillA, start)).changes);

    // A till pulling three at a time while the job removes two at a time between its pages.
    const pulled: SyncChange[] = [];
    let cursor = start;
    let removed = 0;
    for (;;) {
      const page = await pull(app, s.tillA, cursor, 3);
      if (page.changes.length === 0) break;
      pulled.push(...page.changes);
      cursor = page.nextCursor;
      removed += await compact(FAR_AHEAD, 2, 1);
    }
    removed += await compact(FAR_AHEAD, 2, 1_000);
    expect(removed).toBeGreaterThanOrEqual(40);
    for (const id of tables) expect(await rowsOf(id)).toHaveLength(1);
    expect(held(pulled)).toEqual(expected);

    // And at the same moment rather than in turns: many pulls against many short rounds.
    for (let version = 7; version <= 12; version++)
      for (const id of tables) await write(s.shop.branchId, id, copy(`Bàn ${version}`, version));
    const latest = held((await feedOf(s.tillA, start)).changes);
    const [tills] = await Promise.all([
      Promise.all(Array.from({ length: 6 }, () => feedOf(s.tillA, start, 4))),
      compact(FAR_AHEAD, 3, 1_000),
    ]);
    for (const till of tills) expect(held(till.changes)).toEqual(latest);
  });

  it("stays append-only for everything but the compaction", async () => {
    await write(s.shop.branchId, newId(), copy("Bàn", 1));
    const asTenant = (client: pg.Pool, sql: string) =>
      postgresErrorCode(() => withTenant(client, s.shop.tenantId, (c) => c.query(sql)));
    expect(await asTenant(pool, "DELETE FROM change_log")).toBe(INSUFFICIENT_PRIVILEGE);
    // Saying it is the compaction does not lend the app role the privilege it lacks.
    expect(
      await asTenant(pool, "SELECT set_config('fnb.change_log_compaction', 'on', true); DELETE FROM change_log"),
    ).toBe(INSUFFICIENT_PRIVILEGE);
    expect(await asTenant(owner, "DELETE FROM change_log")).toBe(RAISE_EXCEPTION);
    expect(await asTenant(owner, "UPDATE change_log SET entity = 'x'")).toBe(RAISE_EXCEPTION);
    // The setting is cleared once the compaction returns, even in the same transaction.
    expect(
      await asTenant(owner, "SELECT compact_change_log(now(), 10); DELETE FROM change_log"),
    ).toBe(RAISE_EXCEPTION);
    expect(
      await asTenant(pool, "SELECT compact_change_log(now(), 0)"),
    ).toBe(RAISE_EXCEPTION);
  });

  it("sees only the tenant it was opened for", async () => {
    const mine = newId();
    await write(s.shop.branchId, mine, copy("Bàn 1", 1));
    await write(s.shop.branchId, mine, copy("Bàn 2", 2));
    const other = await syncShop(app, pool);
    const removedThere = await compactTenantChangeLog(pool, other.shop.tenantId, {
      olderThan: FAR_AHEAD,
      batchSize: 500,
      maxBatchesPerTenant: 1_000,
    });
    expect(await rowsOf(mine)).toHaveLength(2);
    expect(removedThere).toBeGreaterThanOrEqual(0);
  });
});
