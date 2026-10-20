import type { SyncPassContext } from "./sync-pass";
import type { SyncReport } from "./sync-report";

/**
 * Whether the page came from a server restored since the till last synced. A restore takes
 * the server back to its backup while the till kept going, so the till asks the server for
 * the last command of its own it holds and rebases onto the new generation: the commands
 * the server lost go back in the queue ahead of anything newer, and the feed is pulled from
 * the start. The page itself is not kept: its cursor belongs to the lost timeline.
 * The first generation a till meets (a new till, or one older than generations) is just
 * remembered; a server that names none changes nothing.
 */
export async function rebasedOntoRestoredServer(
  context: SyncPassContext,
  report: SyncReport,
  generation: string | undefined,
): Promise<boolean> {
  if (generation === undefined) return false;
  const known = await context.store.serverGeneration();
  if (known === generation) return false;
  if (known === null) {
    await context.store.adoptServerGeneration(generation);
    return false;
  }
  const state = await context.transport.deviceState();
  const rebase = await context.store.rebaseOntoGeneration(
    state.serverGeneration,
    state.lastDeviceSeq,
  );
  context.emit(rebase.changed);
  report.restore = { resent: rebase.resent, unrecoverable: rebase.unrecoverable };
  return true;
}
