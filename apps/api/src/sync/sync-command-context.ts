import type pg from "pg";
import type { DeviceAuth } from "../devices/device-auth-hook";
import type { CommandTime } from "./command-time";
import type { BranchPricing } from "./sellable-catalog";
import type { SyncCommandEnvelope } from "./sync-wire-types";

/** Who sends a batch: the till, the staff member signed in on it, and its branch's pricing. */
export interface SyncSender {
  readonly device: DeviceAuth;
  /** Recorded as the author of the rows, and as who took the payments. */
  readonly staffId: string;
  readonly branch: BranchPricing;
  /** When the batch reached the server, by the API's clock: work it queues is due from then. */
  readonly receivedAt: Date;
}

/** What a command handler works with, inside the command's own transaction. */
export interface SyncCommandContext extends SyncSender {
  readonly client: pg.PoolClient;
  readonly command: SyncCommandEnvelope;
  /**
   * When the command counts as having happened, decided by the server (readCommandTime):
   * handlers act on time.effectiveAt and time.businessDate, never on command.createdAt or
   * command.businessDate, which only say what the till's clock showed.
   */
  readonly time: CommandTime;
}
