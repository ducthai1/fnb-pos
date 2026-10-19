import { withTenant } from "@fnb/db";
import type pg from "pg";
import { applySyncCommand } from "./apply-sync-command";
import type { SyncSender } from "./sync-command-context";
import { SYNC_ERROR_CODES } from "./sync-error-codes";
import type { SyncCommandEnvelope, SyncCommandResult } from "./sync-wire-types";

/**
 * Applies a till's batch in order, each command in a transaction of its own, so a command
 * accepted early in the batch stays accepted whatever happens to a later one. After a
 * retry the rest of the batch is out of order too and is answered without a database trip.
 */
export async function applySyncBatch(
  pool: pg.Pool,
  sender: SyncSender,
  commands: readonly SyncCommandEnvelope[],
): Promise<SyncCommandResult[]> {
  const results: SyncCommandResult[] = [];
  for (const [index, command] of commands.entries()) {
    const result = await withTenant(pool, sender.device.tenantId, (client) =>
      applySyncCommand(client, sender, command),
    );
    results.push(result);
    if (result.status === "retry") {
      for (const later of commands.slice(index + 1)) {
        results.push({
          commandId: later.commandId,
          status: "retry",
          code: SYNC_ERROR_CODES.outOfOrder,
        });
      }
      break;
    }
  }
  return results;
}
