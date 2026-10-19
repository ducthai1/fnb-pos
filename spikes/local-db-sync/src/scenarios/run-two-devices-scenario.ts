// Two tills on one shop share 200 orders, then both sell, add lines and take payments on
// them at the same time over bad networks. Run twice: with and without the change-log lock.
import { createHash } from "node:crypto";
import { rmSync } from "node:fs";
import type { FaultPlan } from "../faults/faulty-fetch";
import { unplugRandomly } from "../faults/network-switch";
import { makePostgresDir, removePostgresDir, startEmbeddedPostgres } from "../server/start-embedded-postgres";
import { startSyncServer } from "../server/sync-server-app";
import { canonicalState } from "../shared/canonical-state";
import { sampleLines } from "../shared/sample-menu";
import { seededRandom } from "../shared/seeded-random";
import { createOrderOffline } from "../sync-client/pos-order-actions";
import { cursorNeverDecreased } from "../sync-client/sync-stats";
import { auditServer, auditTill, readServerSnapshots } from "./audit-sync-outcome";
import { makeScenarioDir, measureMs, writeScenarioResult } from "./scenario-output";
import { type Till, drainTills, openTill } from "./till-harness";
import { runTillWorkload } from "./till-workload";

const FAULTS: FaultPlan = {
  dropRequest: 0.08,
  dropResponse: 0.12,
  delay: 0.3,
  maxDelayMs: 60,
  duplicate: 0.08,
  lateDelivery: 0.08,
  lateDelayMs: [50, 400],
};
const sha = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);

async function run(serializeChanges: boolean) {
  const root = makeScenarioDir(`two-devices-${serializeChanges ? "locked" : "naive"}`);
  const postgres = await startEmbeddedPostgres(makePostgresDir("two-devices", root));
  const server = await startSyncServer({ connectionString: postgres.connectionString, serializeChanges });
  const networks = [{ online: true }, { online: true }];
  const tills: Till[] = ["till-a", "till-b"].map((deviceId, i) =>
    openTill({
      dir: root,
      deviceId,
      serverUrl: server.url,
      network: networks[i]!,
      faults: FAULTS,
      seed: 500 + i * 10,
      client: { batchSize: 20, batchesInFlight: 1, requestTimeoutMs: 2_000 },
    }),
  );
  try {
    for (const till of tills) {
      for (let i = 0; i < 100; i += 1) await createOrderOffline(till.ctx, sampleLines(till.random, 2));
    }
    await drainTills(tills, server.pool, 120_000);

    const loops = tills.map((till) => till.client.runInBackground(2));
    const unplugs = networks.map((network, i) =>
      unplugRandomly(network, seededRandom(70 + i), { times: 20, gapMs: [50, 250], downMs: [30, 250] }),
    );
    const [workloads, workMs] = await measureMs(() =>
      Promise.all(
        tills.map((till) =>
          runTillWorkload(till, { steps: 600, createShare: 0.3, addLineShare: 0.4, maxPauseMs: 4 }),
        ),
      ),
    );
    await Promise.all(unplugs);
    for (const loop of loops) await loop.stop();
    const [, drainMs] = await measureMs(() => drainTills(tills, server.pool, 120_000));

    const truth = await readServerSnapshots(server.pool);
    const interleave = await server.pool.query<{ switches: string }>(
      `SELECT count(*)::text AS switches FROM (
         SELECT a.device_id, lag(a.device_id) OVER (ORDER BY c.change_seq) AS prev
         FROM change_log c JOIN applied_command a USING (command_id)) x
       WHERE prev IS NOT NULL AND prev <> device_id`,
    );
    return {
      serializeChanges,
      workloads,
      workMs,
      drainMs,
      changeFeedDeviceSwitches: Number(interleave.rows[0]?.switches),
      stateHash: {
        server: sha(canonicalState(truth)),
        tills: await Promise.all(tills.map(async (t) => sha(canonicalState(await t.store.listOrderSnapshots())))),
      },
      tills: await Promise.all(
        tills.map(async (till) => ({
          deviceId: till.deviceId,
          audit: await auditTill(till.store, truth),
          cursor: await till.store.readCursor(),
          cursorNeverDecreased: cursorNeverDecreased(till.client.stats.cursorHistory),
          rejectionCodes: till.client.stats.rejectionCodes,
          replayed: till.client.stats.replayed,
          pushRequests: till.client.stats.pushRequests,
          pushFailures: till.client.stats.pushFailures,
          pullRequests: till.client.stats.pullRequests,
          pullsDeferred: till.client.stats.pullsDeferred,
          faults: till.faults.stats,
        })),
      ),
      server: await auditServer(server.pool),
    };
  } finally {
    for (const till of tills) await till.store.close();
    await server.close();
    await postgres.stop();
    rmSync(root, { recursive: true, force: true });
  }
}

const result = { locked: await run(true), naive: await run(false) };
console.log(`wrote ${writeScenarioResult("two-devices", result)}`);
