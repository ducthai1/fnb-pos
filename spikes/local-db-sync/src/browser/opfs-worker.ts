// Runs inside a dedicated Worker: SQLite WASM on the opfs-sahpool VFS, which needs neither
// SharedArrayBuffer nor COOP/COEP headers, driving the very same LocalStore and sync loop.
import sqlite3InitModule, { type SAHPoolUtil, type Sqlite3Static } from "@sqlite.org/sqlite-wasm";
import { type FaultPlan, NO_FAULTS, createFaultyFetch } from "../faults/faulty-fetch";
import { unplugRandomly } from "../faults/network-switch";
import type { LocalStore } from "../local-store/local-store";
import { createSqliteLocalStore } from "../local-store/sqlite-local-store";
import { canonicalState } from "../shared/canonical-state";
import { snapshotToWire } from "../shared/order-wire-codec";
import { summariseLatencies } from "../shared/percentiles";
import { sampleLines } from "../shared/sample-menu";
import { seededRandom } from "../shared/seeded-random";
import { type PosContext, createOrderOffline } from "../sync-client/pos-order-actions";
import { createSyncClient } from "../sync-client/sync-client";
import { runSecondRunWorkload } from "../scenarios/second-run-workload";
import { wrapWasmDatabase } from "./wasm-sqlite-driver";

const DEFAULT_DB_FILE = "/till-browser.db";
let dbFile = DEFAULT_DB_FILE;
const DEVICE_ID = "till-browser";
let sqlite3: Sqlite3Static | undefined;
let pool: SAHPoolUtil | undefined;
let store: LocalStore | undefined;
let ctx: PosContext | undefined;
const network = { online: true };

function opened(): { store: LocalStore; ctx: PosContext; pool: SAHPoolUtil } {
  if (store === undefined || ctx === undefined || pool === undefined) throw new Error("open first");
  return { store, ctx, pool };
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function syncClient(faults: FaultPlan, seed: number) {
  const faulty = createFaultyFetch(fetch.bind(globalThis), faults, seededRandom(seed), network);
  const client = createSyncClient({
    store: opened().store,
    deviceId: DEVICE_ID,
    baseUrl: self.location.origin,
    fetch: faulty.fetch,
    random: seededRandom(seed + 1),
    batchSize: 25,
    requestTimeoutMs: 2_000,
  });
  return { client, faulty };
}

const phases: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {
  async open(args) {
    sqlite3 ??= await sqlite3InitModule();
    pool ??= await sqlite3.installOpfsSAHPoolVfs({ name: "spike-sahpool" });
    // Each database takes two pool slots (file + journal); the pragma variants need more.
    await pool.reserveMinimumCapacity(16);
    dbFile = typeof args["file"] === "string" ? args["file"] : DEFAULT_DB_FILE;
    const db = new pool.OpfsSAHPoolDb(dbFile);
    const walRequest = db.selectValue("PRAGMA journal_mode = WAL");
    const pragmaAnswers = ((args["pragmas"] as string[] | undefined) ?? []).map((pragma) => [
      pragma,
      db.selectValue(pragma),
    ]);
    store = createSqliteLocalStore(wrapWasmDatabase(db));
    ctx = { store, deviceId: DEVICE_ID, businessDate: "2026-10-20", now: Date.now };
    return {
      sqliteVersion: sqlite3.version.libVersion,
      walRequestAnswer: walRequest,
      pragmaAnswers,
      journalMode: await store.readJournalMode(),
      crossOriginIsolated: self.crossOriginIsolated,
      poolFiles: pool.getFileNames(),
      poolCapacity: pool.getCapacity(),
      cursor: await store.readCursor(),
      commands: await store.countCommands(),
    };
  },

  async writeOffline(args) {
    const { store: s, ctx: c, pool: p } = opened();
    const random = seededRandom(Number(args["seed"]));
    const samples: number[] = [];
    for (let i = 0; i < Number(args["orders"]); i += 1) {
      const lines = sampleLines(random, 3);
      const start = performance.now();
      await createOrderOffline(c, lines);
      samples.push(performance.now() - start);
    }
    return {
      latency: summariseLatencies(samples),
      pagesBytes: await s.readDatabaseSizeBytes(),
      exportedFileBytes: p.exportFile(dbFile).byteLength,
      storageEstimate: await navigator.storage.estimate(),
    };
  },

  async sync(args) {
    const { client } = syncClient(NO_FAULTS, Number(args["seed"]));
    const start = performance.now();
    await client.syncUntilIdle(120_000);
    return { syncMs: Math.round(performance.now() - start), stats: client.stats };
  },

  async workloadUnderFaults(args) {
    const { store: s, ctx: c } = opened();
    const { client, faulty } = syncClient(args["faults"] as FaultPlan, Number(args["seed"]));
    const loop = client.runInBackground(5);
    const unplugs = unplugRandomly(network, seededRandom(Number(args["seed"]) + 7), {
      times: 20,
      gapMs: [50, 300],
      downMs: [30, 300],
    });
    const counts = await runSecondRunWorkload(s, c, seededRandom(Number(args["seed"]) + 9), Number(args["orders"]));
    const unplugCount = await unplugs;
    const start = performance.now();
    await loop.stop();
    await client.syncUntilIdle(120_000);
    await faulty.drain();
    await client.syncUntilIdle(120_000);
    return { counts, unplugCount, drainMs: Math.round(performance.now() - start), stats: client.stats, faults: faulty.stats };
  },

  async state() {
    const { store: s } = opened();
    const snapshots = await s.listOrderSnapshots();
    return {
      cursor: await s.readCursor(),
      stateHash: (await sha256Hex(canonicalState(snapshots))).slice(0, 16),
      snapshots: snapshots.map(snapshotToWire),
      commands: await s.listCommands(),
      pagesBytes: await s.readDatabaseSizeBytes(),
    };
  },

  async close() {
    await opened().store.close();
    store = undefined;
    return { closed: true };
  },
};

const scope = self as unknown as {
  onmessage: (event: MessageEvent<{ id: number; phase: string; args: Record<string, unknown> }>) => void;
  postMessage: (message: unknown) => void;
};

scope.onmessage = async (event) => {
  const { id, phase, args } = event.data;
  try {
    const run = phases[phase];
    if (run === undefined) throw new Error(`unknown phase ${phase}`);
    scope.postMessage({ id, ok: true, value: await run(args) });
  } catch (error) {
    scope.postMessage({ id, ok: false, error: error instanceof Error ? `${error.message}\n${error.stack}` : String(error) });
  }
};
