import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type FaultPlan, NO_FAULTS } from "../faults/faulty-fetch";
import { unplugRandomly } from "../faults/network-switch";
import { startTestPostgres } from "../server/server-test-harness";
import { type RunningSyncServer, startSyncServer } from "../server/sync-server-app";
import { seededRandom } from "../shared/seeded-random";
import { sampleLines } from "../shared/sample-menu";
import { createOrderOffline } from "../sync-client/pos-order-actions";
import { auditServer, auditTill, readServerSnapshots } from "./audit-sync-outcome";
import { type Till, openTill } from "./till-harness";
import { runTillWorkload } from "./till-workload";

let harness: Awaited<ReturnType<typeof startTestPostgres>>;
let server: RunningSyncServer;
let dir: string;
const tills: Till[] = [];

beforeAll(async () => {
  harness = await startTestPostgres();
});
afterAll(async () => harness.stop());
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "spike-sync-test-"));
  server = await startSyncServer({ connectionString: await harness.freshDatabase() });
});
afterEach(async () => {
  for (const till of tills.splice(0)) await till.store.close();
  await server.close();
  rmSync(dir, { recursive: true, force: true });
});

function till(deviceId: string, faults: FaultPlan, seed: number, network = { online: true }): Till {
  const opened = openTill({
    dir,
    deviceId,
    serverUrl: server.url,
    network,
    faults,
    seed,
    synchronous: "NORMAL",
    client: { batchSize: 10, batchesInFlight: 3, requestTimeoutMs: 2_000 },
  });
  tills.push(opened);
  return opened;
}

async function expectNoLossNoDuplicates(t: Till) {
  await t.faults.drain();
  const audit = await auditTill(t.store, await readServerSnapshots(server.pool));
  expect(audit).toMatchObject({ pending: 0, rejected: 0, lostEffects: 0, matchesServer: true });
  const serverAudit = await auditServer(server.pool);
  expect(serverAudit).toMatchObject({ duplicateChangeRows: 0, dayOrderCountExcess: 0, dayPaidVndExcess: "0" });
}

describe("sync loop under network faults", () => {
  it("delivers every offline order exactly once when half the responses are lost", async () => {
    const t = till("till-a", { ...NO_FAULTS, dropResponse: 0.5 }, 11);
    for (let i = 0; i < 100; i += 1) await createOrderOffline(t.ctx, sampleLines(t.random, 3));
    await t.client.syncUntilIdle(30_000);
    expect(t.client.stats.replayed).toBeGreaterThan(0);
    await expectNoLossNoDuplicates(t);
    expect((await auditServer(server.pool)).orders).toBe(100);
  });

  it("keeps every order through lost requests, late and duplicate deliveries and unplugs", async () => {
    const plan: FaultPlan = {
      dropRequest: 0.1,
      dropResponse: 0.1,
      delay: 0.3,
      maxDelayMs: 40,
      duplicate: 0.1,
      lateDelivery: 0.1,
      lateDelayMs: [20, 200],
    };
    const network = { online: true };
    const t = till("till-a", plan, 21, network);
    const loop = t.client.runInBackground(2);
    const unplugs = unplugRandomly(network, seededRandom(5), { times: 5, gapMs: [10, 60], downMs: [10, 80] });
    await runTillWorkload(t, { steps: 120, createShare: 0.6, addLineShare: 0.25, maxPauseMs: 3 });
    await unplugs;
    await loop.stop();
    await t.client.syncUntilIdle(30_000);
    await t.faults.drain();
    await t.client.syncUntilIdle(30_000);
    expect(t.faults.stats.refusedWhileUnplugged + t.faults.stats.lostToUnplug).toBeGreaterThan(0);
    await expectNoLossNoDuplicates(t);
  });
});
