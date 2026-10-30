import type { EntitySnapshot, SyncCommandEnvelope } from "@fnb/contracts";
import { SYNC_CLIENT_ERROR_CODES, SyncClientError } from "../sync-client-error";
import { applyPulledChanges, readCursor } from "./apply-pulled-changes";
import { ChangeTracker, readView } from "./entity-views";
import type { EntityView, LocalStore, RejectedCommand } from "./local-store";
import {
  COUNT_PENDING_SQL,
  FIND_OUTBOX_SQL,
  INSERT_OUTBOX_SQL,
  LOCAL_SCHEMA_SQL,
  READ_ENTITY_IDS_SQL,
  READ_META_SQL,
  READ_ACCEPTED_SHIFT_CASH_SQL,
  READ_PENDING_SQL,
  READ_REJECTED_SQL,
  UPSERT_OPTIMISTIC_SQL,
  WRITE_META_SQL,
} from "./local-store-schema-sql";
import { ensureJournalColumns, pruneJournal } from "./command-journal";
import {
  ensureClockColumns,
  onServerClock,
  readClockOffset,
  retimePending,
  saveClockOffset,
} from "./till-clock-offset";
import { recordCommandResults } from "./record-command-results";
import {
  adoptServerGeneration,
  dropCopiesTheServerLost,
  readRestoreState,
  readServerGeneration,
  rebaseOntoGeneration,
} from "./server-restore";
import { type SqlRow, type SqliteDriver, inTransaction } from "./sqlite-driver";
import { validateLocalCommand } from "./validate-local-command";

const readMeta = (driver: SqliteDriver, key: string): string | null => {
  const [row] = driver.all(READ_META_SQL, [key]);
  return row === undefined ? null : String(row.value);
};

/** The version the till itself put on its expectation; only server versions are compared. */
const ownVersionOf = (snapshot: EntitySnapshot): number =>
  Number.isSafeInteger(snapshot.version) ? Number(snapshot.version) : 0;

const envelopeOf = (row: SqlRow): SyncCommandEnvelope => ({
  ...(JSON.parse(String(row.envelope)) as Omit<SyncCommandEnvelope, "deviceSeq">),
  deviceSeq: Number(row.device_seq),
});

/** The LocalStore over a synchronous SQLite driver; every method is one transaction. */
export function createSqliteLocalStore(driver: SqliteDriver): LocalStore {
  driver.exec(LOCAL_SCHEMA_SQL);
  ensureJournalColumns(driver);
  ensureClockColumns(driver);
  const views = (entity: string): EntityView[] =>
    driver
      .all(READ_ENTITY_IDS_SQL, [entity])
      .map((row) => readView(driver, { entity, entityId: String(row.entity_id) }))
      .filter((view): view is EntityView => view !== null);

  return {
    bindDevice: async (deviceId) =>
      inTransaction(driver, () => {
        const bound = readMeta(driver, "device_id");
        if (bound === null) driver.run(WRITE_META_SQL, ["device_id", deviceId]);
        else if (bound !== deviceId)
          throw new SyncClientError(SYNC_CLIENT_ERROR_CODES.deviceMismatch);
      }),

    enqueue: async (command) => {
      const { target, ...recorded } = validateLocalCommand(command);
      return inTransaction(driver, () => {
        const offset = readClockOffset(driver) ?? 0;
        const envelope = { ...recorded, createdAt: onServerClock(recorded.createdAt, offset) };
        if (driver.all(FIND_OUTBOX_SQL, [envelope.commandId]).length > 0) {
          throw new SyncClientError(SYNC_CLIENT_ERROR_CODES.commandIdTaken);
        }
        const tracker = new ChangeTracker(driver);
        tracker.touch(target);
        const [row] = driver.all(INSERT_OUTBOX_SQL, [
          envelope.commandId,
          envelope.type,
          target.entity,
          target.entityId,
          JSON.stringify(envelope),
          recorded.createdAt,
        ]);
        driver.run(UPSERT_OPTIMISTIC_SQL, [
          target.entity,
          target.entityId,
          ownVersionOf(target.optimistic),
          JSON.stringify(target.optimistic),
        ]);
        return {
          command: { ...envelope, deviceSeq: Number(row?.device_seq) },
          changed: tracker.changed(),
        };
      });
    },

    pendingCommands: async (limit) => driver.all(READ_PENDING_SQL, [limit]).map(envelopeOf),

    acceptedShiftCommands: async (limit) =>
      driver.all(READ_ACCEPTED_SHIFT_CASH_SQL, [limit]).map((row) => ({
        command: envelopeOf(row),
        shiftVersion: Number(row.shift_version),
      })),

    pendingCount: async () => Number(driver.all(COUNT_PENDING_SQL)[0]?.n ?? 0),

    recordResults: async (sent, results, settledAt = new Date().toISOString()) =>
      recordCommandResults(driver, sent, results, settledAt),

    applyChanges: async (page) => applyPulledChanges(driver, page),

    cursor: async () => readCursor(driver),

    snapshot: async (entity, entityId) => readView(driver, { entity, entityId }),

    snapshots: async (entity) => views(entity),

    rejectedCommands: async () =>
      driver.all(READ_REJECTED_SQL).map((row): RejectedCommand => ({
        entity: String(row.entity),
        entityId: String(row.entity_id),
        command: envelopeOf(row),
        code: String(row.code),
        serverSnapshot:
          row.server_snapshot === null
            ? null
            : (JSON.parse(String(row.server_snapshot)) as EntitySnapshot),
      })),

    serverGeneration: async () => readServerGeneration(driver),

    adoptServerGeneration: async (generation) => adoptServerGeneration(driver, generation),

    rebaseOntoGeneration: async (generation, serverLastSeq) =>
      rebaseOntoGeneration(driver, generation, serverLastSeq),

    dropCopiesTheServerLost: async () => dropCopiesTheServerLost(driver),

    restoreState: async () => readRestoreState(driver),

    pruneJournal: async (now, settledBefore) => pruneJournal(driver, { now, settledBefore }),

    clockOffset: async () => readClockOffset(driver),

    saveClockOffset: async (offsetMs) =>
      inTransaction(driver, () => saveClockOffset(driver, offsetMs)),

    retimePending: async (fromDeviceSeq, notAfter) =>
      retimePending(driver, fromDeviceSeq, notAfter),

    close: async () => driver.close(),
  };
}
