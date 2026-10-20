import type { SentLineState } from "@fnb/domain";
import type { CounterOrder } from "../order/counter-order";
import type { KeptLines } from "../order/price-counter-order";
import type { StoredOrder } from "../order/stored-order";
import type { CounterOrderSession } from "../order/use-counter-order";
import type { SettledTableOrder } from "./table-order-state";

export type PreBillState = "none" | "current" | "changed";

export interface TableOrderSession extends CounterOrderSession {
  readonly order: CounterOrder;
  readonly kept: KeptLines;
  readonly sent: readonly SentLineState[];
  readonly preBill: PreBillState;
  /** A command of the order the server refused: nothing more is saved until it is reopened. */
  readonly refusal: { readonly type: string; readonly code: string } | null;
  /** The order as last saved once every queued save is recorded; null if one failed. */
  settled(): Promise<SettledTableOrder | null>;
  /** After tickets printed: what the stations have now, and the items that locks. */
  noteSent(sent: readonly SentLineState[], kept: KeptLines): void;
  notePreBill(): void;
  /** Cancel lines made on the till whose server ids are not known yet. */
  readonly unconfirmedCancels: ReadonlySet<string>;
  noteLocalCancel(lineId: string): void;
  /** Takes the server's lines and sent state once its copy has every command of the till. */
  rebase(stored: StoredOrder): void;
}
