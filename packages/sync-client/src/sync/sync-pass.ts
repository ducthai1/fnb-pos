import {
  SYNC_CLOCK_ERROR_CODES,
  type SyncCommandEnvelope,
  type SyncCommandResult,
} from "@fnb/contracts";
import type { EntityRef, LocalStore } from "../local-store/local-store";
import { clockOffsetOf } from "./server-clock";
import { rebasedOntoRestoredServer } from "./server-generation-check";
import { type SyncFailure, type SyncReport, failureOf } from "./sync-report";
import type { SyncTransport } from "./sync-transport";

export interface SyncPassContext {
  readonly store: LocalStore;
  readonly transport: SyncTransport;
  readonly batchSize: number;
  readonly pullLimit: number;
  readonly maxPullPages: number;
  readonly emit: (changed: readonly EntityRef[]) => void;
  /** The till's clock as an ISO instant, stamped on the commands the server settles. */
  readonly now: () => string;
  /** The till's clock in ms: when a request left and when its answer came back. */
  readonly nowMs: () => number;
}

/** Keeps how far the server's clock is from the till's, when the answer named it. */
async function learnServerClock(
  context: SyncPassContext,
  serverTimeMs: number | undefined,
  sentAtMs: number,
): Promise<void> {
  if (serverTimeMs === undefined) return;
  await context.store.saveClockOffset(clockOffsetOf(serverTimeMs, sentAtMs, context.nowMs()));
}

/**
 * A command the server sent back for being dated ahead of its clock: it and every later one
 * are dated again by the offset just measured, to go out on the next pass under the same
 * ids. Answers whether any was; never with no server time to date them by.
 */
async function retimedAfterClockRetry(
  context: SyncPassContext,
  batch: readonly SyncCommandEnvelope[],
  results: readonly SyncCommandResult[],
  serverTimeMs: number | undefined,
): Promise<boolean> {
  const sentBack = results.find(
    (result) =>
      result.status === "retry" && result.code === SYNC_CLOCK_ERROR_CODES.deviceClockAhead,
  );
  const command = batch.find((sent) => sent.commandId === sentBack?.commandId);
  if (command === undefined || serverTimeMs === undefined) return false;
  const notAfter = new Date(serverTimeMs).toISOString();
  return (await context.store.retimePending(command.deviceSeq, notAfter)) > 0;
}

/**
 * The oldest pending commands made under one staff session: a batch is pushed with one
 * session's credential and the server records that session's staff member as the author
 * of every command in it, so commands one cashier recorded offline, before someone else
 * signed in on the till, go in a batch of their own rather than under the newcomer's name.
 */
export function oneSessionsRun(pending: readonly SyncCommandEnvelope[]): SyncCommandEnvelope[] {
  const first = pending[0];
  if (first === undefined) return [];
  const end = pending.findIndex((command) => command.staffSessionId !== first.staffSessionId);
  return pending.slice(0, end === -1 ? pending.length : end);
}

/**
 * Sends the oldest pending commands of one staff session as one batch, the only one in
 * flight for this till: the server takes a till's commands strictly in device_seq order, so
 * a second batch racing the first would only come back as retries.
 */
export async function pushOneBatch(
  context: SyncPassContext,
  report: SyncReport,
): Promise<SyncFailure | null> {
  const batch = oneSessionsRun(await context.store.pendingCommands(context.batchSize));
  if (batch.length === 0) return null;
  try {
    const sentAt = context.nowMs();
    const pushed = await context.transport.pushCommands(batch);
    const { results, serverTimeMs } = "results" in pushed ? pushed : { results: pushed };
    await learnServerClock(context, serverTimeMs, sentAt);
    const recorded = await context.store.recordResults(batch, results, context.now());
    context.emit(recorded.changed);
    report.accepted.push(...recorded.accepted);
    report.rejected.push(...recorded.rejected);
    report.retried += results.filter((result) => result.status === "retry").length;
    if (results.length === 0) return { stage: "push", kind: "protocol" };
    const retimed = await retimedAfterClockRetry(context, batch, results, serverTimeMs);
    // Every answer a retry: going again at once would spin, so the pass counts as failed
    // and the next one backs off. Commands dated again are not a spin: they go out on the
    // next pass dated no later than the server's clock, and it takes them.
    const settled = recorded.accepted.length + recorded.rejected.length;
    return settled > 0 || retimed ? null : { stage: "push", kind: "out_of_order" };
  } catch (error) {
    return failureOf("push", error);
  }
}

/**
 * Pulls page after page until the feed's end or maxPullPages, so a till far behind still
 * pushes between pages. It runs whether or not commands are pending. A page from a server
 * restored since the last pass rebases the till first (rebasedOntoRestoredServer).
 */
export async function pullToEnd(
  context: SyncPassContext,
  report: SyncReport,
): Promise<SyncFailure | null> {
  for (let page = 0; page < context.maxPullPages; page += 1) {
    try {
      const cursor = await context.store.cursor();
      const sentAt = context.nowMs();
      const changes = await context.transport.pullChanges(cursor, context.pullLimit);
      await learnServerClock(context, changes.serverTimeMs, sentAt);
      if (await rebasedOntoRestoredServer(context, report, changes.serverGeneration)) continue;
      const written = await context.store.applyChanges(changes);
      context.emit(written.changed);
      report.pulled += changes.changes.length;
      if (changes.changes.length < context.pullLimit) {
        report.caughtUp = true;
        context.emit((await context.store.dropCopiesTheServerLost()).changed);
        return null;
      }
    } catch (error) {
      return failureOf("pull", error);
    }
  }
  return null;
}
