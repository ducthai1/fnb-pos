import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FaultPlan } from "../faults/faulty-fetch";
import { startTestPostgres } from "../server/server-test-harness";
import { type RunningSyncServer, startSyncServer } from "../server/sync-server-app";
import { SYNC_ERROR_CODES } from "../shared/sync-error-codes";
import { auditServer, auditTill, readServerSnapshots } from "./audit-sync-outcome";
import { type Till, drainTills, openTill } from "./till-harness";
import { runTillWorkload } from "./till-workload";
import { sampleLines } from "../shared/sample-menu";
import { createOrderOffline } from "../sync-client/pos-order-actions";

let harness: Awaited<ReturnType<typeof startTestPostgres>>;
let server: RunningSyncServer;
let dir: string;
let tills: Till[] = [];

beforeAll(async () => {
  harness = await startTestPostgres();
});
afterAll(async () => harness.stop());
afterEach(async () => {
  for (const till of tills) await till.store.close();
  await server.close();
  rmSync(dir, { recursive: true, force: true });
});

const FAULTS: FaultPlan = {
  dropRequest: 0.05,
  dropResponse: 0.1,
  delay: 0.3,
  maxDelayMs: 30,
  duplicate: 0.05,
  lateDelivery: 0.05,
  lateDelayMs: [20, 150],
};

describe("two tills pushing at the same time", () => {
  it("end with the same orders as the server, conflicts resolved by the server", async () => {
    dir = mkdtempSync(join(tmpdir(), "spike-two-tills-"));
    server = await startSyncServer({ connectionString: await harness.freshDatabase() });
    tills = ["till-a", "till-b"].map((deviceId, i) =>
      openTill({
        dir,
        deviceId,
        serverUrl: server.url,
        network: { online: true },
        faults: FAULTS,
        seed: 100 + i * 10,
        synchronous: "NORMAL",
        client: { batchSize: 5, batchesInFlight: 2, requestTimeoutMs: 2_000 },
      }),
    );
    // Orders both tills know about, so payments and extra lines collide on the same order.
    const [tillA] = tills;
    for (let i = 0; i < 15; i += 1) await createOrderOffline(tillA!.ctx, sampleLines(tillA!.random, 2));
    await drainTills(tills, server.pool, 30_000);

    const loops = tills.map((till) => till.client.runInBackground(1));
    await Promise.all(
      tills.map((till) =>
        runTillWorkload(till, { steps: 80, createShare: 0.3, addLineShare: 0.4, maxPauseMs: 4 }),
      ),
    );
    for (const loop of loops) await loop.stop();
    await drainTills(tills, server.pool, 30_000);

    const truth = await readServerSnapshots(server.pool);
    const legitimate = new Set<string>([SYNC_ERROR_CODES.orderAlreadyPaid, SYNC_ERROR_CODES.orderTotalMismatch]);
    for (const till of tills) {
      expect(await auditTill(till.store, truth)).toMatchObject({ pending: 0, lostEffects: 0, matchesServer: true });
      expect(Object.keys(till.client.stats.rejectionCodes).every((code) => legitimate.has(code))).toBe(true);
    }
    expect(tills.reduce((sum, till) => sum + till.client.stats.rejected, 0)).toBeGreaterThan(0);
    expect(await auditServer(server.pool)).toMatchObject({
      duplicateChangeRows: 0,
      dayOrderCountExcess: 0,
      dayPaidCountExcess: 0,
      dayPaidVndExcess: "0",
      changesOutOfDeviceOrder: 0,
    });
  });
});
