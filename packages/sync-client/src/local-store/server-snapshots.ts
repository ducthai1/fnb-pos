import type { EntitySnapshot } from "@fnb/contracts";
import { SYNC_CLIENT_ERROR_CODES, SyncClientError } from "../sync-client-error";
import type { EntityRef } from "./local-store";
import {
  COUNT_PENDING_FOR_ENTITY_SQL,
  DELETE_OPTIMISTIC_SQL,
  DELETE_SERVER_SQL,
  READ_SERVER_SQL,
  UPSERT_OPTIMISTIC_SQL,
  UPSERT_SERVER_SQL,
} from "./local-store-schema-sql";
import type { SqliteDriver } from "./sqlite-driver";

/** The server's row version; copies of one row are ordered by it and nothing else. */
export function serverVersionOf(snapshot: EntitySnapshot): number {
  const { version } = snapshot;
  if (typeof version === "number" && Number.isSafeInteger(version) && version >= 0) return version;
  throw new SyncClientError(SYNC_CLIENT_ERROR_CODES.snapshotWithoutVersion);
}

/** Keeps a copy of the row the server sent, unless a newer one is kept already. */
export function keepServerSnapshot(
  driver: SqliteDriver,
  ref: EntityRef,
  snapshot: EntitySnapshot | null,
): void {
  if (snapshot === null) {
    driver.run(DELETE_SERVER_SQL, [ref.entity, ref.entityId]);
    return;
  }
  if (typeof snapshot.id === "string" && snapshot.id !== ref.entityId) {
    throw new SyncClientError(SYNC_CLIENT_ERROR_CODES.snapshotOfAnotherEntity);
  }
  driver.run(UPSERT_SERVER_SQL, [
    ref.entity,
    ref.entityId,
    serverVersionOf(snapshot),
    JSON.stringify(snapshot),
  ]);
}

/**
 * After one of the till's commands on the row settled: with nothing of its own pending the
 * till's expectation goes and the server's copy shows. When a refusal came with the server's
 * row while later commands still wait, the expectation restarts from that row, since the
 * refused change is in it no more.
 */
export function reconcileOptimistic(
  driver: SqliteDriver,
  ref: EntityRef,
  restartFromServer: boolean,
): void {
  const [pending] = driver.all(COUNT_PENDING_FOR_ENTITY_SQL, [ref.entity, ref.entityId]);
  const [server] = driver.all(READ_SERVER_SQL, [ref.entity, ref.entityId]);
  if (Number(pending?.n ?? 0) === 0 || (restartFromServer && server?.snapshot === null)) {
    driver.run(DELETE_OPTIMISTIC_SQL, [ref.entity, ref.entityId]);
  } else if (restartFromServer && server !== undefined) {
    driver.run(UPSERT_OPTIMISTIC_SQL, [
      ref.entity,
      ref.entityId,
      server.version ?? 0,
      server.snapshot ?? null,
    ]);
  }
}
