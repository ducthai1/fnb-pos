import type { OrderLineRow, OrderRow, OrderSnapshot } from "../shared/order-rows";
import type { ChangeWire, CommandBody } from "../shared/sync-wire-types";

export interface LocalWrite {
  orders: OrderRow[];
  lines: OrderLineRow[];
}

export type CommandDraft = CommandBody & { commandId: string; createdAt: number };

/** `deviceSeq` is assigned by the store inside the write transaction, so it follows commit order. */
export type OutboxEntry = CommandDraft & { deviceSeq: number };

export interface LocalRejection {
  commandId: string;
  code: string;
  orderId: string;
  /** Server truth for the order; null when the server has never seen it. */
  snapshot: OrderSnapshot | null;
}

export type PullApplyOutcome = "applied" | "deferred-pending-commands";

export interface CommandCounts {
  pending: number;
  accepted: number;
  rejected: number;
}

/**
 * The till's database as the sync layer sees it. Every method is async even though both
 * SQLite engines are synchronous underneath: on Tauri/Capacitor each call crosses an IPC
 * bridge, so a transaction must live entirely inside one call, never across awaits.
 */
export interface LocalStore {
  /** Business rows and the command describing them commit together, or not at all. */
  writeWithCommand(write: LocalWrite, command: CommandDraft): Promise<OutboxEntry>;
  readPendingCommands(limit: number): Promise<OutboxEntry[]>;
  markAccepted(commandIds: readonly string[]): Promise<void>;
  /** Marks the command rejected and replaces the optimistic order with the server's copy. */
  markRejected(rejection: LocalRejection): Promise<void>;
  /** Applies a pulled page and stores its cursor in the same transaction. */
  applyPulledChanges(changes: readonly ChangeWire[], nextCursor: string): Promise<PullApplyOutcome>;
  readCursor(): Promise<string>;
  readOrderSnapshot(orderId: string): Promise<OrderSnapshot | null>;
  listOrderSnapshots(): Promise<OrderSnapshot[]>;
  countCommands(): Promise<CommandCounts>;
  readDatabaseSizeBytes(): Promise<number>;
  readJournalMode(): Promise<string>;
  close(): Promise<void>;
}
