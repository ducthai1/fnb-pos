import type { SyncCommandEnvelope, SyncCommandResult } from "@fnb/contracts";
import { SYNC_CLIENT_ERROR_CODES, SyncClientError } from "../sync-client-error";
import { ChangeTracker } from "./entity-views";
import type { RecordedResults } from "./local-store";
import {
  INSERT_REJECTED_SQL,
  READ_OUTBOX_ROW_SQL,
  SETTLE_OUTBOX_SQL,
} from "./local-store-schema-sql";
import { keepServerSnapshot, reconcileOptimistic } from "./server-snapshots";
import { type SqliteDriver, inTransaction } from "./sqlite-driver";

/** Each result must answer a command of the batch, once; anything else is not this batch. */
function assertAnswersBatch(
  sent: readonly SyncCommandEnvelope[],
  results: readonly SyncCommandResult[],
): void {
  const unanswered = new Set(sent.map((command) => command.commandId));
  for (const result of results) {
    if (!unanswered.delete(result.commandId)) {
      throw new SyncClientError(SYNC_CLIENT_ERROR_CODES.unexpectedResult);
    }
  }
}

/**
 * Settles the batch's answers in one transaction. A retry stays pending and goes again in
 * device_seq order. A repeated answer for a command settled before changes nothing but may
 * still carry a server row, which is kept only if newer than the one the till has.
 */
export function recordCommandResults(
  driver: SqliteDriver,
  sent: readonly SyncCommandEnvelope[],
  results: readonly SyncCommandResult[],
  settledAt: string,
): RecordedResults {
  assertAnswersBatch(sent, results);
  return inTransaction(driver, () => {
    const tracker = new ChangeTracker(driver);
    const accepted: string[] = [];
    const rejected: string[] = [];
    for (const result of results) {
      if (result.status === "retry") continue;
      const [row] = driver.all(READ_OUTBOX_ROW_SQL, [result.commandId]);
      if (row === undefined) throw new SyncClientError(SYNC_CLIENT_ERROR_CODES.unexpectedResult);
      const ref = { entity: String(row.entity), entityId: String(row.entity_id) };
      tracker.touch(ref);
      // No row in an answer means none was sent, not that the row is gone.
      if (result.snapshot !== undefined) keepServerSnapshot(driver, ref, result.snapshot);
      const code = result.status === "rejected" ? result.code : null;
      const shiftVersion = result.status === "accepted" ? (result.shiftVersion ?? null) : null;
      const settled = [result.status, code, settledAt, shiftVersion, result.commandId];
      if (driver.run(SETTLE_OUTBOX_SQL, settled) === 0) continue;
      if (result.status === "rejected") {
        driver.run(INSERT_REJECTED_SQL, [
          result.commandId,
          row.device_seq ?? null,
          ref.entity,
          ref.entityId,
          result.code,
          row.envelope ?? null,
          result.snapshot === undefined ? null : JSON.stringify(result.snapshot),
        ]);
        rejected.push(result.commandId);
      } else {
        accepted.push(result.commandId);
      }
      reconcileOptimistic(
        driver,
        ref,
        result.status === "rejected" && result.snapshot !== undefined,
      );
    }
    return { changed: tracker.changed(), accepted, rejected };
  });
}
