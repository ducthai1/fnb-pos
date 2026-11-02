import { SYNC_CLOCK_ERROR_CODES } from "@fnb/contracts";
import type { LocalStore } from "../local-store/local-store";
import { SyncTransportError, type SyncTransport } from "./sync-transport";

/** As many as the server takes in one batch. */
const FLUSH_BATCH = 100;
/**
 * Passes that settle nothing before the flush gives up: a till whose clock runs ahead is
 * dated again once, and a batch answered only with retries after that would spin.
 */
const IDLE_PASSES = 2;

export type FlushOutcome =
  | { readonly kind: "done"; readonly accepted: number; readonly rejected: number }
  | {
      readonly kind: "failed";
      readonly accepted: number;
      readonly rejected: number;
      /** Why it stopped: what the server said, or that it did not answer. */
      readonly error: SyncTransportError;
    };

/**
 * Sends a revoked till's whole outbox under a manager's flush grant, oldest first, one batch
 * at a time, and records every answer in the store as the usual push does: a command taken
 * leaves the outbox, a refused one goes on the till's refused list, where it is shown and
 * never dropped. The batch that empties the outbox says so, which spends the grant. Stopped
 * halfway (the network, a spent code), what was not settled stays in the outbox, to be sent
 * again under the same code or a new one: the server answers a command it has already taken
 * with what it answered the first time.
 */
export async function flushOutboxUnderGrant(
  store: LocalStore,
  transport: SyncTransport,
  code: string,
  now: () => string,
): Promise<FlushOutcome> {
  let accepted = 0;
  let rejected = 0;
  let idle = 0;
  const flush = transport.flushUnderGrant?.bind(transport);
  if (flush === undefined) {
    const error = new SyncTransportError("http", 404, "this transport cannot flush");
    return { kind: "failed", accepted, rejected, error };
  }
  for (;;) {
    const batch = await store.pendingCommands(FLUSH_BATCH);
    if (batch.length === 0) return { kind: "done", accepted, rejected };
    const final = (await store.pendingCount()) <= batch.length;
    let pushed;
    try {
      pushed = await flush(code, batch, final);
    } catch (caught) {
      const error =
        caught instanceof SyncTransportError
          ? caught
          : new SyncTransportError("network", null, String(caught));
      return { kind: "failed", accepted, rejected, error };
    }
    const { results, serverTimeMs } = "results" in pushed ? pushed : { results: pushed };
    const recorded = await store.recordResults(batch, results, now());
    accepted += recorded.accepted.length;
    rejected += recorded.rejected.length;
    const clockAhead = results.find(
      (result) =>
        result.status === "retry" && result.code === SYNC_CLOCK_ERROR_CODES.deviceClockAhead,
    );
    const sentBack = batch.find((sent) => sent.commandId === clockAhead?.commandId);
    const retimed =
      sentBack !== undefined && serverTimeMs !== undefined
        ? await store.retimePending(sentBack.deviceSeq, new Date(serverTimeMs).toISOString())
        : 0;
    const settled = recorded.accepted.length + recorded.rejected.length;
    idle = settled > 0 || retimed > 0 ? 0 : idle + 1;
    if (idle >= IDLE_PASSES) {
      const error = new SyncTransportError("protocol", 200, "the server settles nothing");
      return { kind: "failed", accepted, rejected, error };
    }
  }
}
