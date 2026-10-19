import type {
  EntitySnapshot,
  SyncChangesPage,
  SyncCommandEnvelope,
  SyncCommandResult,
} from "@fnb/contracts";

/** One row the till shows, e.g. { entity: "order", entityId: <order id> }. */
export interface EntityRef {
  readonly entity: string;
  readonly entityId: string;
}

/** A command as the POS records it: the store numbers it (deviceSeq) when it commits. */
export type LocalCommand = Omit<SyncCommandEnvelope, "deviceSeq"> & {
  /** The row the command changes, and that row as the till expects it to look afterwards. */
  readonly target: EntityRef & { readonly optimistic: EntitySnapshot };
};

/** What the till shows for one row. */
export interface EntityView extends EntityRef {
  /** The till's own expectation while one of its commands on the row waits; else the server's row. */
  readonly snapshot: EntitySnapshot;
  readonly source: "optimistic" | "server";
  /** The highest server version seen for the row (pulled or in a command result), if any. */
  readonly serverVersion: number | null;
}

/** A command the server refused for good, kept for the "needs attention" screen. */
export interface RejectedCommand extends EntityRef {
  readonly command: SyncCommandEnvelope;
  readonly code: string;
  /** The row as the server held it when it refused, when it sent one. */
  readonly serverSnapshot: EntitySnapshot | null;
}

/** What a write changed on screen: rows whose shown snapshot is now different. */
export interface StoreWrite {
  readonly changed: readonly EntityRef[];
}

export interface RecordedResults extends StoreWrite {
  /** Commands settled by this write; an answer repeated for a settled command is not counted. */
  readonly accepted: readonly string[];
  readonly rejected: readonly string[];
}

export interface EnqueuedCommand extends StoreWrite {
  /** The command as it will be sent, numbered. */
  readonly command: SyncCommandEnvelope;
}

/**
 * The till's database as the sync layer sees it. Every method is async and runs one whole
 * transaction: on Tauri/Capacitor each call crosses the IPC bridge, and a transaction left
 * open across calls could interleave with another call or land on another connection.
 */
export interface LocalStore {
  /** Ties the database to one till on first use; a database of another till is refused. */
  bindDevice(deviceId: string): Promise<void>;
  /** Writes the command to the outbox and the optimistic row in one transaction. */
  enqueue(command: LocalCommand): Promise<EnqueuedCommand>;
  /** The oldest commands still waiting, in deviceSeq order. */
  pendingCommands(limit: number): Promise<SyncCommandEnvelope[]>;
  pendingCount(): Promise<number>;
  /** Settles answered commands and keeps the server rows they carry; retries stay pending. */
  recordResults(
    sent: readonly SyncCommandEnvelope[],
    results: readonly SyncCommandResult[],
  ): Promise<RecordedResults>;
  /** Keeps a pulled page and moves the cursor in the same transaction. */
  applyChanges(page: SyncChangesPage): Promise<StoreWrite>;
  /** The feed position to pull from: "0" before the first pull. */
  cursor(): Promise<string>;
  snapshot(entity: string, entityId: string): Promise<EntityView | null>;
  /** Every row of `entity` the till shows, ordered by id. */
  snapshots(entity: string): Promise<EntityView[]>;
  rejectedCommands(): Promise<RejectedCommand[]>;
  close(): Promise<void>;
}
