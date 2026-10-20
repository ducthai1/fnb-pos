import type { SyncCommandEnvelope } from "@fnb/contracts";
import type { EntityRef, LocalStore } from "../local-store/local-store";
import { type SyncFailure, type SyncReport, failureOf } from "./sync-report";
import type { SyncTransport } from "./sync-transport";

export interface SyncPassContext {
  readonly store: LocalStore;
  readonly transport: SyncTransport;
  readonly batchSize: number;
  readonly pullLimit: number;
  readonly maxPullPages: number;
  readonly emit: (changed: readonly EntityRef[]) => void;
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
    const results = await context.transport.pushCommands(batch);
    const recorded = await context.store.recordResults(batch, results);
    context.emit(recorded.changed);
    report.accepted.push(...recorded.accepted);
    report.rejected.push(...recorded.rejected);
    report.retried += results.filter((result) => result.status === "retry").length;
    if (results.length === 0) return { stage: "push", kind: "protocol" };
    // Every answer a retry: going again at once would spin, so the pass counts as failed
    // and the next one backs off.
    const settled = recorded.accepted.length + recorded.rejected.length;
    return settled > 0 ? null : { stage: "push", kind: "out_of_order" };
  } catch (error) {
    return failureOf("push", error);
  }
}

/**
 * Pulls page after page until the feed's end or maxPullPages, so a till far behind still
 * pushes between pages. It runs whether or not commands are pending.
 */
export async function pullToEnd(
  context: SyncPassContext,
  report: SyncReport,
): Promise<SyncFailure | null> {
  for (let page = 0; page < context.maxPullPages; page += 1) {
    try {
      const cursor = await context.store.cursor();
      const changes = await context.transport.pullChanges(cursor, context.pullLimit);
      const written = await context.store.applyChanges(changes);
      context.emit(written.changed);
      report.pulled += changes.changes.length;
      if (changes.changes.length < context.pullLimit) {
        report.caughtUp = true;
        return null;
      }
    } catch (error) {
      return failureOf("pull", error);
    }
  }
  return null;
}
