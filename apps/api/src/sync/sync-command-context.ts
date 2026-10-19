import type pg from "pg";
import type { DeviceAuth } from "../devices/device-auth-hook";
import type { BranchPricing } from "./sellable-catalog";
import type { SyncCommandEnvelope } from "./sync-wire-types";

/** Who sends a batch: the till, the staff member signed in on it, and its branch's pricing. */
export interface SyncSender {
  readonly device: DeviceAuth;
  /** Recorded as the author of the rows, and as who took the payments. */
  readonly staffId: string;
  readonly branch: BranchPricing;
}

/** What a command handler works with, inside the command's own transaction. */
export interface SyncCommandContext extends SyncSender {
  readonly client: pg.PoolClient;
  readonly command: SyncCommandEnvelope;
}
