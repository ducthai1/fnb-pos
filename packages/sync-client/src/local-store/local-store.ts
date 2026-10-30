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

/** What a rebase onto a restored server's generation did. */
export interface ServerRebase extends StoreWrite {
  /** Commands the server had answered and lost, queued again in device_seq order. */
  readonly resent: number;
  /** device_seq numbers the server lacks and the journal no longer holds. */
  readonly unrecoverable: number;
}

/** What is left to do after the server was restored from a backup. */
export interface RestoreState {
  /** Commands put back in the queue by the last rebase that are still waiting. */
  readonly resending: number;
  readonly unrecoverable: number;
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
/** An accepted command with the shift copy version its cash reaches. */
export interface AcceptedShiftCommand {
  readonly command: SyncCommandEnvelope;
  readonly shiftVersion: number;
}

export interface LocalStore {
  /** Ties the database to one till on first use; a database of another till is refused. */
  bindDevice(deviceId: string): Promise<void>;
  /**
   * Writes the command to the outbox and the optimistic row in one transaction. Its
   * createdAt is the till's own clock; it goes out dated by the server's (plus the kept
   * clock offset), and the answer says the instant it was given.
   */
  enqueue(command: LocalCommand): Promise<EnqueuedCommand>;
  /** The oldest commands still waiting, in deviceSeq order. */
  pendingCommands(limit: number): Promise<SyncCommandEnvelope[]>;
  pendingCount(): Promise<number>;
  /**
   * The latest accepted commands whose answer named the version of the shift copy their cash
   * reaches, newest first: what the till keeps in a shift's expected cash until its copy of
   * the shift has caught up.
   */
  acceptedShiftCommands(limit: number): Promise<AcceptedShiftCommand[]>;
  /**
   * Settles answered commands and keeps the server rows they carry; retries stay pending.
   * Settled commands stay in the journal, stamped `settledAt` (an ISO instant), until pruned.
   */
  recordResults(
    sent: readonly SyncCommandEnvelope[],
    results: readonly SyncCommandResult[],
    settledAt?: string,
  ): Promise<RecordedResults>;
  /** Keeps a pulled page and moves the cursor in the same transaction. */
  applyChanges(page: SyncChangesPage): Promise<StoreWrite>;
  /** The feed position to pull from: "0" before the first pull. */
  cursor(): Promise<string>;
  snapshot(entity: string, entityId: string): Promise<EntityView | null>;
  /** Every row of `entity` the till shows, ordered by id. */
  snapshots(entity: string): Promise<EntityView[]>;
  rejectedCommands(): Promise<RejectedCommand[]>;
  /**
   * Takes a refusal off the "needs attention" list for good: the staff dealt with it. The
   * command stays in the journal as refused; true when the refusal was there to take off.
   */
  resolveRejected(commandId: string): Promise<boolean>;
  /** The server generation the till last saw, null before the first one. */
  serverGeneration(): Promise<string | null>;
  /** Remembers the first generation the till meets; a known one is never replaced here. */
  adoptServerGeneration(generation: string): Promise<void>;
  /** Catches up with a restored server that holds this till's commands up to serverLastSeq. */
  rebaseOntoGeneration(generation: string, serverLastSeq: number): Promise<ServerRebase>;
  /** After a rebase and a pull to the feed's end: drops copies the new server never sent. */
  dropCopiesTheServerLost(): Promise<StoreWrite>;
  restoreState(): Promise<RestoreState>;
  /** Drops journal rows settled before `settledBefore`; answers how many went. */
  pruneJournal(now: string, settledBefore: string): Promise<number>;
  /**
   * How far the server's clock is ahead of the till's, in ms (below 0: the till runs fast),
   * as last measured; null before any answer named the server's clock.
   */
  clockOffset(): Promise<number | null>;
  /** Keeps a freshly measured offset: commands recorded from now on are dated by it. */
  saveClockOffset(offsetMs: number): Promise<void>;
  /**
   * After the server sent a command back for its date: dates it and every later pending
   * command again by the kept offset, none after `notAfter` (see till-clock-offset.ts).
   */
  retimePending(fromDeviceSeq: number, notAfter: string): Promise<number>;
  close(): Promise<void>;
}
