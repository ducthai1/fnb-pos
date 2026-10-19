import type { SeededRandom } from "../shared/seeded-random";
import type { NetworkSwitch } from "./network-switch";

/** Probability of each fault per request; they are drawn independently. */
export interface FaultPlan {
  dropRequest: number;
  /** The server applies the request but the till never hears back: the hardest case. */
  dropResponse: number;
  delay: number;
  maxDelayMs: number;
  /** The request reaches the server twice, concurrently. */
  duplicate: number;
  /** The till times out and retries; the original arrives later, after newer batches. */
  lateDelivery: number;
  lateDelayMs: readonly [number, number];
}

export const NO_FAULTS: FaultPlan = {
  dropRequest: 0,
  dropResponse: 0,
  delay: 0,
  maxDelayMs: 0,
  duplicate: 0,
  lateDelivery: 0,
  lateDelayMs: [0, 0],
};

export interface FaultStats {
  requests: number;
  droppedRequests: number;
  droppedResponses: number;
  delayed: number;
  duplicated: number;
  lateDeliveries: number;
  refusedWhileUnplugged: number;
  lostToUnplug: number;
}

export interface FaultyFetch {
  fetch: typeof fetch;
  stats: FaultStats;
  /** Waits for late and duplicate deliveries still travelling, so checks see their effect. */
  drain(): Promise<void>;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const networkError = (why: string) => new TypeError(`fetch failed: ${why}`);

export function createFaultyFetch(
  realFetch: typeof fetch,
  plan: FaultPlan,
  random: SeededRandom,
  network: NetworkSwitch,
): FaultyFetch {
  const stats: FaultStats = {
    requests: 0,
    droppedRequests: 0,
    droppedResponses: 0,
    delayed: 0,
    duplicated: 0,
    lateDeliveries: 0,
    refusedWhileUnplugged: 0,
    lostToUnplug: 0,
  };
  const travelling = new Set<Promise<unknown>>();
  const track = (promise: Promise<unknown>) => {
    const settled = promise.catch(() => undefined);
    travelling.add(settled);
    void settled.finally(() => travelling.delete(settled));
  };

  const faultyFetch = async (input: string | URL | Request, init?: RequestInit) => {
    stats.requests += 1;
    if (!network.online) {
      stats.refusedWhileUnplugged += 1;
      throw networkError("network unplugged");
    }
    if (random.chance(plan.dropRequest)) {
      stats.droppedRequests += 1;
      throw networkError("request lost");
    }
    const { signal: _ignored, ...detached } = init ?? {};
    if (random.chance(plan.lateDelivery)) {
      stats.lateDeliveries += 1;
      track(sleep(random.int(plan.lateDelayMs[0], plan.lateDelayMs[1])).then(() => realFetch(input, detached)));
      throw networkError("timed out (request still travelling)");
    }
    if (random.chance(plan.delay)) {
      stats.delayed += 1;
      await sleep(random.int(0, plan.maxDelayMs));
    }
    if (random.chance(plan.duplicate)) {
      stats.duplicated += 1;
      track(realFetch(input, detached).then((r) => r.text()));
    }
    const response = await realFetch(input, init);
    // Read the whole body so "the server finished" is true before deciding to lose it.
    const body = await response.text();
    if (random.chance(plan.dropResponse)) {
      stats.droppedResponses += 1;
      throw networkError("response lost");
    }
    if (!network.online) {
      stats.lostToUnplug += 1;
      throw networkError("network unplugged mid-request");
    }
    return new Response(body, { status: response.status, headers: response.headers });
  };

  return {
    fetch: faultyFetch as typeof fetch,
    stats,
    drain: async () => {
      while (travelling.size > 0) await Promise.all([...travelling]);
    },
  };
}
