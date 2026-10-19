// Cost of one "save order" (order + 3 lines + outbox command, one transaction) on node:sqlite,
// on the real disk, with the two durability settings a till could pick.
import { rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { type SynchronousMode, openNodeSqliteDriver } from "../local-store/node-sqlite-driver";
import { createSqliteLocalStore } from "../local-store/sqlite-local-store";
import { summariseLatencies } from "../shared/percentiles";
import { sampleLines } from "../shared/sample-menu";
import { seededRandom } from "../shared/seeded-random";
import { createOrderOffline } from "../sync-client/pos-order-actions";
import { makeScenarioDir, writeScenarioResult } from "./scenario-output";

const ORDERS = 2_000;
const root = makeScenarioDir("write-latency");

async function measure(synchronous: SynchronousMode) {
  const path = join(root, `till-${synchronous}.db`);
  const store = createSqliteLocalStore(openNodeSqliteDriver(path, synchronous));
  const random = seededRandom(42);
  const ctx = { store, deviceId: "till-a", businessDate: "2026-10-20", now: Date.now };
  const samples: number[] = [];
  for (let i = 0; i < ORDERS; i += 1) {
    const lines = sampleLines(random, 3);
    const start = performance.now();
    await createOrderOffline(ctx, lines);
    samples.push(performance.now() - start);
  }
  const pagesBytes = await store.readDatabaseSizeBytes();
  await store.close();
  return { synchronous, latency: summariseLatencies(samples), pagesBytes, fileBytesAfterCheckpoint: statSync(path).size };
}

try {
  const result = { orders: ORDERS, linesPerOrder: 3, disk: "ext4 on NVMe", runs: [await measure("FULL"), await measure("NORMAL")] };
  console.log(`wrote ${writeScenarioResult("local-write-latency", result)}`);
} finally {
  rmSync(root, { recursive: true, force: true });
}
