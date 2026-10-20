import type { OrderChargeProfile, OrderLine, SentLineState } from "@fnb/domain";
import type { LocalCommand } from "@fnb/sync-client";
import type { CounterOrder } from "./counter-order";
import type { TillOrderState } from "./order-snapshot-for-till";
import type { KeptLines, PricedCounterOrder } from "./price-counter-order";

/** The order on the counter and what has been recorded of it on the till. */
export interface Recorded {
  /** Charge profile the order opened with: the server keeps that one for the order's life. */
  chargeProfile: OrderChargeProfile;
  /** Day of the first save, which the server keeps as the order's day. */
  businessDate: string | null;
  version: number;
  /** What the stations have of each item: a table's rounds sent so far; none on the counter. */
  sent?: readonly SentLineState[];
}

/**
 * The order as last saved, with what a command on it builds from: the lines the server
 * holds (the cart's, kept items as stored, then the lines commands made).
 */
export interface AdjustableOrder {
  readonly order: CounterOrder;
  readonly priced: PricedCounterOrder;
  /** Items held exactly as stored: what the kitchen has, or what a discount or void points at. */
  readonly kept: KeptLines;
  readonly commandLines: readonly OrderLine[];
  readonly sent: readonly SentLineState[];
  /** The order as recorded before the command, which adds one to its version. */
  readonly state: TillOrderState;
}

/** What a command on the order leaves: the cart, what it holds, the lines commands made. */
export interface Adjusted {
  readonly order: CounterOrder;
  readonly kept: KeptLines;
  readonly commandLines: readonly OrderLine[];
  readonly priced: PricedCounterOrder;
  readonly command: LocalCommand;
}

export interface CounterOrderSession {
  readonly order: CounterOrder | null;
  readonly chargeProfile: OrderChargeProfile | null;
  readonly saveFailed: boolean;
  /** Items held exactly as stored, never changed from the cart. */
  readonly kept: KeptLines;
  /** Discounts and cancel lines the order carries beside its cart. */
  readonly commandLines: readonly OrderLine[];
  /** Changes the cart; the draft is saved on the till right after, in the order changed. */
  update(change: (order: CounterOrder) => CounterOrder): void;
  /** Saves the draft priced at `at` once every earlier save is recorded; null when it failed. */
  saveAt(at: number): Promise<PricedCounterOrder | null>;
  readonly recorded: () => Readonly<Recorded>;
  /**
   * Records a command after every save already queued; one on the order bumps its version,
   * unless it leaves the order's row as it was (`keepsVersion`), as buyer details do.
   */
  record(command: LocalCommand, options?: { readonly keepsVersion?: boolean }): Promise<void>;
  /** The order as last saved once every queued save is recorded; null if none or one failed. */
  adjustable(): Promise<AdjustableOrder | null>;
  /**
   * Records the command `make` builds from the order as last saved, after every queued save,
   * and takes what it leaves. Throws what `make` throws (a domain refusal) and records nothing.
   */
  adjust(make: (order: AdjustableOrder) => Adjusted): Promise<void>;
  /** Clears the counter for the next customer. */
  startNew(): void;
}

/** Nothing was saved yet, or the last save failed: there is no order to build on. */
export class NothingSavedError extends Error {
  constructor() {
    super("the order has no save to build a command on");
    this.name = "NothingSavedError";
  }
}
