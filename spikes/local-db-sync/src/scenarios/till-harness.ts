import { join } from "node:path";
import type pg from "pg";
import { type FaultPlan, type FaultyFetch, createFaultyFetch } from "../faults/faulty-fetch";
import type { NetworkSwitch } from "../faults/network-switch";
import type { LocalStore } from "../local-store/local-store";
import { type SynchronousMode, openNodeSqliteDriver } from "../local-store/node-sqlite-driver";
import { createSqliteLocalStore } from "../local-store/sqlite-local-store";
import { type SeededRandom, seededRandom } from "../shared/seeded-random";
import type { PosContext } from "../sync-client/pos-order-actions";
import { type SyncClient, type SyncClientOptions, createSyncClient } from "../sync-client/sync-client";

export interface Till {
  deviceId: string;
  dbPath: string;
  store: LocalStore;
  ctx: PosContext;
  client: SyncClient;
  faults: FaultyFetch;
  random: SeededRandom;
}

export interface TillOptions {
  dir: string;
  deviceId: string;
  serverUrl: string;
  network: NetworkSwitch;
  faults: FaultPlan;
  seed: number;
  synchronous?: SynchronousMode;
  client?: Partial<Pick<SyncClientOptions, "batchSize" | "batchesInFlight" | "requestTimeoutMs">>;
}

/** A till with its own SQLite file and its own faulty network; reopening the file resumes it. */
export function openTill(o: TillOptions): Till {
  const dbPath = join(o.dir, `${o.deviceId}.db`);
  const store = createSqliteLocalStore(openNodeSqliteDriver(dbPath, o.synchronous));
  const random = seededRandom(o.seed);
  const faults = createFaultyFetch(fetch, o.faults, seededRandom(o.seed + 1), o.network);
  const client = createSyncClient({
    store,
    deviceId: o.deviceId,
    baseUrl: o.serverUrl,
    fetch: faults.fetch,
    random: seededRandom(o.seed + 2),
    ...o.client,
  });
  const ctx: PosContext = { store, deviceId: o.deviceId, businessDate: "2026-10-20", now: Date.now };
  return { deviceId: o.deviceId, dbPath, store, ctx, client, faults, random };
}

/**
 * Until every till has an empty outbox and a cursor at the server's last change. One pass is
 * not enough: a till that pulled before another till's last push is behind again.
 */
export async function drainTills(tills: readonly Till[], pool: pg.Pool, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    for (const till of tills) {
      await till.faults.drain();
      await till.client.syncUntilIdle(timeoutMs);
    }
    const { rows } = await pool.query<{ max: string | null }>("SELECT max(change_seq)::text AS max FROM change_log");
    const last = rows[0]?.max ?? "0";
    const cursors = await Promise.all(tills.map((till) => till.store.readCursor()));
    const pending = await Promise.all(tills.map(async (till) => (await till.store.countCommands()).pending));
    if (cursors.every((c) => c === last) && pending.every((n) => n === 0)) return;
    if (Date.now() > deadline) throw new Error(`tills did not converge: ${cursors.join(",")} vs ${last}`);
  }
}
