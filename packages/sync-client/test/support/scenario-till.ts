import { join } from "node:path";
import type { Till } from "@fnb/api/test-support/sync-shop";
import {
  type SyncClient,
  type SyncClock,
  type SyncReport,
  createHttpSyncTransport,
  createSqliteLocalStore,
  createSyncClient,
} from "../../src";
import type { HttpSend, LocalStore } from "../../src";
import { openNodeSqliteDriver } from "../../src/local-store/node-sqlite-driver";
import { type FaultPlan, FlakyNetwork, NO_FAULTS } from "./flaky-network";
import { type SeededRandom, seededRandom } from "./seeded-random";

export interface ScenarioTillOptions {
  /** Where the till's SQLite file lives; reopening the same name resumes it. */
  dir: string;
  name: string;
  seed: number;
  clock: SyncClock;
  faults?: FaultPlan;
  batchSize?: number;
  pullLimit?: number;
  maxPullPages?: number;
  /** The POS build the till names to the server; none by default, as a build before the header. */
  posBuild?: number;
}

/** A till as it runs in a shop: its own database file, network and sync client. */
export class ScenarioTill {
  readonly store: LocalStore;
  readonly client: SyncClient;
  readonly network: FlakyNetwork;
  readonly random: SeededRandom;
  readonly dbPath: string;

  /** `send` reaches the API: a ScenarioServer's, or one wrapped to misdeliver on purpose. */
  constructor(
    send: HttpSend,
    readonly till: Till,
    options: ScenarioTillOptions,
  ) {
    this.dbPath = join(options.dir, `${options.name}.db`);
    this.store = createSqliteLocalStore(openNodeSqliteDriver(this.dbPath));
    this.random = seededRandom(options.seed);
    this.network = new FlakyNetwork(
      send,
      seededRandom(options.seed + 1),
      options.faults ?? NO_FAULTS,
    );
    this.client = createSyncClient({
      store: this.store,
      transport: createHttpSyncTransport({
        send: this.network.send,
        deviceToken: till.deviceToken,
        staffSessionToken: () => till.staffToken,
        ...(options.posBuild === undefined ? {} : { posBuild: options.posBuild }),
      }),
      deviceId: till.deviceId,
      clock: options.clock,
      random: seededRandom(options.seed + 2).next,
      ...(options.batchSize === undefined ? {} : { batchSize: options.batchSize }),
      ...(options.pullLimit === undefined ? {} : { pullLimit: options.pullLimit }),
      ...(options.maxPullPages === undefined ? {} : { maxPullPages: options.maxPullPages }),
    });
  }

  /** Passes until nothing is pending, the feed is read to its end and nothing is travelling. */
  async syncUntilIdle(maxPasses = 1_000): Promise<SyncReport[]> {
    const reports: SyncReport[] = [];
    for (let pass = 0; pass < maxPasses; pass += 1) {
      const report = await this.client.syncOnce();
      reports.push(report);
      if (report.pending === 0 && report.caughtUp && report.failure === null) {
        await this.network.drain();
        return reports;
      }
    }
    throw new Error(`till not idle after ${maxPasses} passes: ${JSON.stringify(reports.at(-1))}`);
  }

  close(): Promise<void> {
    return this.store.close();
  }
}

/**
 * Until a whole round where no till pushed or pulled anything: one round is not enough, a
 * till that pulled before another till's last push is behind again.
 */
export async function syncUntilConverged(tills: readonly ScenarioTill[], maxRounds = 50) {
  for (let round = 0; round < maxRounds; round += 1) {
    let quiet = true;
    for (const till of tills) {
      const reports = await till.syncUntilIdle();
      const moved = reports.some((r) => r.pulled > 0 || r.accepted.length + r.rejected.length > 0);
      if (moved) quiet = false;
    }
    if (quiet) return;
  }
  throw new Error(`tills did not converge in ${maxRounds} rounds`);
}

/** The orders a till shows, by id; the snapshot only. */
export async function shownOrders(till: ScenarioTill) {
  const views = await till.client.snapshots("order");
  return new Map(views.map((view) => [view.entityId, view.snapshot as unknown]));
}
