import type { SyncChangesPage } from "@fnb/contracts";
import { SYNC_CLIENT_ERROR_CODES, SyncClientError } from "../sync-client-error";
import { ChangeTracker } from "./entity-views";
import type { EntityRef, StoreWrite } from "./local-store";
import { READ_META_SQL, WRITE_META_SQL } from "./local-store-schema-sql";
import { keepServerSnapshot } from "./server-snapshots";
import { type SqliteDriver, inTransaction } from "./sqlite-driver";

export const INITIAL_CURSOR = "0";
const DECIMAL = /^(0|[1-9]\d*)$/;

const cursorValue = (text: string): bigint => {
  if (!DECIMAL.test(text)) throw new SyncClientError(SYNC_CLIENT_ERROR_CODES.unreadableCursor);
  return BigInt(text);
};

export function readCursor(driver: SqliteDriver): string {
  const [row] = driver.all(READ_META_SQL, ["cursor"]);
  return row === undefined ? INITIAL_CURSOR : String(row.value);
}

/**
 * Keeps a pulled page, whether or not the till's own commands on those rows are pending:
 * waiting for an empty outbox starves the pull at peak hours, and the till then sells on
 * another till's stale data. Pending rows keep showing the till's expectation; the server
 * copy kept underneath shows once they settle. The rows and the cursor commit together, so
 * a crash can neither skip a change nor keep one without moving past it.
 */
export function applyPulledChanges(driver: SqliteDriver, page: SyncChangesPage): StoreWrite {
  return inTransaction(driver, () => {
    const current = cursorValue(readCursor(driver));
    const next = cursorValue(page.nextCursor);
    const last = page.changes.at(-1);
    if (next < current || (last !== undefined && next < cursorValue(last.changeSeq))) {
      throw new SyncClientError(SYNC_CLIENT_ERROR_CODES.cursorRegressed);
    }
    const tracker = new ChangeTracker(driver);
    // A removal is told even when the till showed nothing of the row: a copy it holds from
    // elsewhere (its bootstrap) is gone too, which no change of its database would say.
    const removed = new Map<string, EntityRef>();
    for (const change of page.changes) {
      if (cursorValue(change.changeSeq) <= current) {
        throw new SyncClientError(SYNC_CLIENT_ERROR_CODES.staleChange);
      }
      const ref = { entity: change.entity, entityId: change.entityId };
      tracker.touch(ref);
      keepServerSnapshot(driver, ref, change.snapshot);
      if (change.snapshot === null) removed.set(`${ref.entity}:${ref.entityId}`, ref);
    }
    driver.run(WRITE_META_SQL, ["cursor", next.toString()]);
    const changed = tracker.changed();
    for (const ref of changed) removed.delete(`${ref.entity}:${ref.entityId}`);
    return { changed: [...changed, ...removed.values()] };
  });
}
