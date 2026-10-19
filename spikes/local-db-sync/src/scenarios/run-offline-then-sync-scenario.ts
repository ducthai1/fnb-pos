// 2,000 orders written offline, then synced; then a second run on the SAME till file and the
// SAME server database (both restarted) adds 500 orders while the network misbehaves.
import { rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { type FaultPlan, NO_FAULTS } from "../faults/faulty-fetch";
import { unplugRandomly } from "../faults/network-switch";
import { makePostgresDir, removePostgresDir, startEmbeddedPostgres } from "../server/start-embedded-postgres";
import { startSyncServer } from "../server/sync-server-app";
import { summariseLatencies } from "../shared/percentiles";
import { sampleLines } from "../shared/sample-menu";
import { seededRandom } from "../shared/seeded-random";
import { createOrderOffline } from "../sync-client/pos-order-actions";
import { cursorNeverDecreased } from "../sync-client/sync-stats";
import { auditServer, auditTill, readServerSnapshots } from "./audit-sync-outcome";
import { makeScenarioDir, measureMs, writeScenarioResult } from "./scenario-output";
import { runSecondRunWorkload } from "./second-run-workload";
import { openTill } from "./till-harness";

const FAULTS: FaultPlan = {
  dropRequest: 0.1,
  dropResponse: 0.15,
  delay: 0.3,
  maxDelayMs: 80,
  duplicate: 0.1,
  lateDelivery: 0.1,
  lateDelayMs: [50, 600],
};

const root = makeScenarioDir("offline-sync");
const pgDir = makePostgresDir("offline-sync", root);
const fileSize = (path: string) => statSync(path, { throwIfNoEntry: false })?.size ?? 0;

async function runOne() {
  const postgres = await startEmbeddedPostgres(pgDir);
  const server = await startSyncServer({ connectionString: postgres.connectionString });
  const network = { online: false };
  const till = openTill({ dir: root, deviceId: "till-a", serverUrl: server.url, network, faults: NO_FAULTS, seed: 1 });
  try {
    const writes: number[] = [];
    for (let i = 0; i < 2_000; i += 1) {
      const start = performance.now();
      await createOrderOffline(till.ctx, sampleLines(till.random, 3));
      writes.push(performance.now() - start);
    }
    const offlineAttempt = await till.client.syncOnce();
    const sizes = { pagesBytes: await till.store.readDatabaseSizeBytes(), dbFile: fileSize(till.dbPath), walFile: fileSize(`${till.dbPath}-wal`) };
    network.online = true;
    const [, syncMs] = await measureMs(() => till.client.syncUntilIdle(300_000));
    const pushSpan = await server.pool.query<{ ms: string }>(
      "SELECT round(extract(epoch FROM max(applied_at) - min(applied_at)) * 1000)::text AS ms FROM applied_command",
    );
    const truth = await readServerSnapshots(server.pool);
    return {
      writeLatency: summariseLatencies(writes),
      journalMode: await till.store.readJournalMode(),
      offlineAttempt,
      sizesAfter2000: sizes,
      syncMs,
      serverPushSpanMs: Number(pushSpan.rows[0]?.ms),
      till: await auditTill(till.store, truth),
      server: await auditServer(server.pool),
      stats: till.client.stats,
      cursorNeverDecreased: cursorNeverDecreased(till.client.stats.cursorHistory),
      cursor: await till.store.readCursor(),
    };
  } finally {
    await till.store.close();
    await server.close();
    await postgres.stop();
  }
}

async function runTwo(cursorAfterRunOne: string) {
  const postgres = await startEmbeddedPostgres(pgDir);
  const server = await startSyncServer({ connectionString: postgres.connectionString });
  const network = { online: true };
  const till = openTill({
    dir: root,
    deviceId: "till-a",
    serverUrl: server.url,
    network,
    faults: FAULTS,
    seed: 2,
    client: { batchSize: 25, batchesInFlight: 3, requestTimeoutMs: 2_000 },
  });
  try {
    const cursorAtStart = await till.store.readCursor();
    const loop = till.client.runInBackground(5);
    const unplugs = unplugRandomly(network, seededRandom(9), { times: 20, gapMs: [50, 300], downMs: [30, 300] });
    const counts = await runSecondRunWorkload(till.store, till.ctx, seededRandom(3), 500);
    const unplugCount = await unplugs;
    const [, drainMs] = await measureMs(async () => {
      await loop.stop();
      await till.client.syncUntilIdle(300_000);
      await till.faults.drain();
      await till.client.syncUntilIdle(300_000);
    });
    const truth = await readServerSnapshots(server.pool);
    const history = [cursorAfterRunOne, cursorAtStart, ...till.client.stats.cursorHistory];
    return {
      counts,
      unplugCount,
      drainAfterLastWriteMs: drainMs,
      cursorAtStart,
      cursorNeverDecreased: cursorNeverDecreased(history),
      till: await auditTill(till.store, truth),
      server: await auditServer(server.pool),
      stats: { ...till.client.stats, cursorHistory: history.length },
      faults: till.faults.stats,
      dbFileBeforeClose: fileSize(till.dbPath),
    };
  } finally {
    await till.store.close();
    await server.close();
    await postgres.stop();
  }
}

try {
  const first = await runOne();
  const second = await runTwo(first.cursor);
  const result = { first: { ...first, stats: { ...first.stats, cursorHistory: first.stats.cursorHistory.length } }, second, dbFileAfterClose: fileSize(join(root, "till-a.db")) };
  console.log(`wrote ${writeScenarioResult("offline-then-sync", result)}`);
} finally {
  removePostgresDir(pgDir);
  rmSync(root, { recursive: true, force: true });
}
