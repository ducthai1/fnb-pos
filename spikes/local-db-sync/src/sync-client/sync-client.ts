import type { LocalStore, OutboxEntry } from "../local-store/local-store";
import { snapshotFromWire } from "../shared/order-wire-codec";
import type { SeededRandom } from "../shared/seeded-random";
import type { CommandWire, PullResponseWire, PushResponseWire } from "../shared/sync-wire-types";
import { type BackoffPolicy, backoffDelayMs } from "./retry-backoff";
import { type SyncStats, emptySyncStats } from "./sync-stats";

export interface SyncClientOptions {
  store: LocalStore;
  deviceId: string;
  baseUrl: string;
  fetch: typeof fetch;
  random: SeededRandom;
  batchSize?: number;
  /** >1 pipelines batches; the server's device_seq guard turns any reordering into a retry. */
  batchesInFlight?: number;
  pullLimit?: number;
  requestTimeoutMs?: number;
  backoff?: BackoffPolicy;
}

export interface SyncPassResult {
  pending: number;
  caughtUp: boolean;
}

export interface SyncClient {
  readonly stats: SyncStats;
  /** Drains the outbox, then pulls; network errors are counted and backed off, never thrown. */
  syncOnce(): Promise<SyncPassResult>;
  syncUntilIdle(timeoutMs: number): Promise<void>;
  runInBackground(idleMs: number): { stop(): Promise<void> };
}

type PushRound = "empty" | "progress" | "stalled";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function toWire(entry: OutboxEntry): CommandWire {
  const { commandId, deviceSeq, createdAt, ...body } = entry;
  return { ...body, command_id: commandId, device_seq: deviceSeq, created_at: createdAt };
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );
}

export function createSyncClient(o: SyncClientOptions): SyncClient {
  const stats = emptySyncStats();
  const batchSize = o.batchSize ?? 100;
  const inFlight = o.batchesInFlight ?? 1;
  const policy = o.backoff ?? { baseMs: 20, maxMs: 1_000 };
  let consecutiveFailures = 0;

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const signal = AbortSignal.timeout(o.requestTimeoutMs ?? 5_000);
    const response = await o.fetch(`${o.baseUrl}${path}`, { ...init, signal });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${path}`);
    return (await response.json()) as T;
  }

  async function settle(response: PushResponseWire): Promise<number> {
    const accepted: string[] = [];
    let settled = 0;
    for (const result of response.results) {
      if (result.status === "retry") {
        stats.retriedOutOfOrder += 1;
        continue;
      }
      settled += 1;
      if (result.replayed) stats.replayed += 1;
      if (result.status === "accepted") {
        accepted.push(result.command_id);
        stats.accepted += 1;
        continue;
      }
      stats.rejected += 1;
      stats.rejectionCodes[result.code] = (stats.rejectionCodes[result.code] ?? 0) + 1;
      await o.store.markRejected({
        commandId: result.command_id,
        code: result.code,
        orderId: result.order_id,
        snapshot: result.snapshot === null ? null : snapshotFromWire(result.snapshot),
      });
    }
    if (accepted.length > 0) await o.store.markAccepted(accepted);
    return settled;
  }

  async function pushRound(): Promise<PushRound> {
    const pending = await o.store.readPendingCommands(batchSize * inFlight);
    if (pending.length === 0) return "empty";
    stats.pushRounds += 1;
    const responses = await Promise.allSettled(
      chunk(pending, batchSize).map((batch) => {
        stats.pushRequests += 1;
        return request<PushResponseWire>("/commands", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ device_id: o.deviceId, commands: batch.map(toWire) }),
        });
      }),
    );
    let settled = 0;
    for (const response of responses) {
      if (response.status === "fulfilled") settled += await settle(response.value);
      else stats.pushFailures += 1;
    }
    // A round that settled nothing (all lost, or all out of order) must back off, or a
    // permanently stuck queue would spin the CPU.
    return settled > 0 ? "progress" : "stalled";
  }

  async function pullAll(): Promise<"caught-up" | "deferred" | "failed"> {
    for (;;) {
      const cursor = await o.store.readCursor();
      let page: PullResponseWire;
      try {
        stats.pullRequests += 1;
        page = await request<PullResponseWire>(
          `/changes?cursor=${cursor}&limit=${o.pullLimit ?? 1_000}`,
        );
      } catch {
        stats.pullFailures += 1;
        return "failed";
      }
      if ((await o.store.applyPulledChanges(page.changes, page.next_cursor)) !== "applied") {
        stats.pullsDeferred += 1;
        return "deferred";
      }
      stats.cursorHistory.push(page.next_cursor);
      if (!page.has_more) return "caught-up";
    }
  }

  async function syncOnce(): Promise<SyncPassResult> {
    let round: PushRound;
    do round = await pushRound();
    while (round === "progress");
    const pulled = round === "empty" ? await pullAll() : "deferred";
    if (round === "stalled" || pulled === "failed") {
      consecutiveFailures += 1;
      await sleep(backoffDelayMs(policy, consecutiveFailures, o.random));
    } else {
      consecutiveFailures = 0;
    }
    const { pending } = await o.store.countCommands();
    return { pending, caughtUp: round === "empty" && pulled === "caught-up" };
  }

  return {
    stats,
    syncOnce,
    async syncUntilIdle(timeoutMs) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const pass = await syncOnce();
        if (pass.pending === 0 && pass.caughtUp) return;
        if (Date.now() > deadline) {
          throw new Error(`sync not idle after ${timeoutMs} ms: ${JSON.stringify(pass)}`);
        }
      }
    },
    runInBackground(idleMs) {
      let stopped = false;
      const loop = (async () => {
        while (!stopped) {
          await syncOnce();
          await sleep(idleMs);
        }
      })();
      return {
        stop: async () => {
          stopped = true;
          await loop;
        },
      };
    },
  };
}
