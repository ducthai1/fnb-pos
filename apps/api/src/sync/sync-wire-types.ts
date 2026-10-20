import type { OrderEInvoiceSnapshot, PaymentIntentSnapshot } from "@fnb/contracts";
import type { ShiftSnapshot } from "./shift-wire-types";

/**
 * What sync sends over the network. Money is a whole-đồng JSON number (a safe integer),
 * a quantity a decimal string ("1.5"), a rate integer basis points. These mirror the sync
 * shapes of the contracts package so the two can be swapped when it lands.
 */

export interface SyncCommandEnvelope {
  readonly commandId: string;
  /** 1, 2, 3… per till, with no gaps: the server applies a till's commands in this order. */
  readonly deviceSeq: number;
  readonly type: string;
  readonly payload: unknown;
  readonly staffSessionId?: string;
  readonly approvalId?: string;
  readonly businessDate: string;
  /** The domain rules version the till computed with. */
  readonly domainVersion: string;
  /** When the till recorded the command; prices are resolved as of this instant. */
  readonly createdAt: string;
  /** Set on a command sent again after a restore: the generation that took it first. */
  readonly resentFromGeneration?: string;
}

export type SyncCommandStatus = "accepted" | "rejected" | "retry";

/** What a command was about: an order, a cash shift, or a QR the till showed. */
export type CommandSnapshot = OrderSnapshot | ShiftSnapshot | PaymentIntentSnapshot;

export interface SyncCommandResult<Snapshot extends CommandSnapshot = CommandSnapshot> {
  readonly commandId: string;
  readonly status: SyncCommandStatus;
  readonly code?: string;
  /** The order as the server holds it after the command (accepted) or now (rejected). */
  readonly snapshot?: Snapshot;
}

export interface SyncChange {
  /** A decimal string: change_seq is a bigint and the cursor is compared as a number. */
  readonly changeSeq: string;
  readonly entity: string;
  readonly entityId: string;
  readonly snapshot: unknown;
}

export interface SyncChangesPage {
  readonly changes: readonly SyncChange[];
  /** Pass back as `cursor`; equal to the cursor sent when the page is empty. */
  readonly nextCursor: string;
}

export interface ServiceChargeRuleSnapshot {
  readonly rate: number;
  readonly appliesTo: readonly string[];
  readonly base: "before_discount" | "after_discount";
  readonly taxRate: number;
}

export interface ChargeProfileSnapshot {
  readonly pricesIncludeTax: boolean;
  readonly serviceCharge: ServiceChargeRuleSnapshot | null;
}

export interface OrderLineSnapshot {
  readonly id: string;
  readonly parentLineId: string | null;
  readonly lineType: string;
  readonly productId: string | null;
  readonly variantId: string | null;
  readonly modifierOptionId: string | null;
  readonly nameSnapshot: string;
  readonly unitPrice: number;
  readonly quantity: string;
  readonly taxRate: number;
  readonly note: string | null;
  readonly priceSource: string;
  readonly reversesLineId: string | null;
  /** On a line discount: its quantity is for the item's whole line, not per unit. */
  readonly wholeParentLine: boolean;
  /** Units the kitchen has had, cancelled ones included, as a decimal string. */
  readonly sentQuantity: string;
  /** The note as the stations last saw it printed, so a till can tell a note changed since. */
  readonly sentNote: string | null;
  /** On a refund's negative item: whether the goods go back into stock. */
  readonly restock: boolean | null;
}

/** One goods line of a refund: its share of what the sale charged, negative like the refund. */
export interface RefundLineAmountsSnapshot {
  readonly lineId: string;
  readonly soldLineId: string;
  readonly gross: number;
  readonly discountAllocated: number;
  readonly tax: number;
  readonly serviceCharge: number;
  readonly serviceChargeTax: number;
}

/** What a refund gives back, fixed when it was built; a till totals the refund from it. */
export interface RefundAmountsSnapshot {
  readonly pricesIncludeTax: boolean;
  readonly serviceChargeTaxRate: number;
  readonly lines: readonly RefundLineAmountsSnapshot[];
}

export interface PaymentSnapshot {
  readonly id: string;
  readonly method: string;
  readonly amount: number;
  readonly receivedByStaffId: string;
  /** The QR intent a bank transfer paid with; null for any other money. */
  readonly paymentIntentId: string | null;
}

/** A whole order as one change: a till replaces its copy with this, lines and payments included. */
export interface OrderSnapshot {
  readonly id: string;
  readonly branchId: string;
  readonly deviceId: string;
  readonly deviceOrderNo: number;
  readonly status: string;
  readonly serviceType: string;
  readonly channelKey: string | null;
  readonly businessDate: string;
  readonly version: number;
  readonly refundOfOrderId: string | null;
  readonly officialNo: string | null;
  readonly callNumber: string | null;
  readonly tableId: string | null;
  readonly tableName: string | null;
  readonly tableTag: string | null;
  /** The table's status reads this: a draft at a table whose pre-bill is current waits to pay. */
  readonly preBillPrinted: boolean;
  /**
   * The version the last pre-bill was printed for (null: none yet). Below `version`, the
   * order changed after its pre-bill, which every till can tell, not only one that saw it.
   */
  readonly preBillPrintedVersion: number | null;
  /** When the order was opened, by the server's reading of the till's time. */
  readonly openedAt: string;
  readonly reasonCode: string | null;
  readonly chargeProfile: ChargeProfileSnapshot;
  readonly refundAmounts: RefundAmountsSnapshot | null;
  readonly lines: readonly OrderLineSnapshot[];
  readonly payments: readonly PaymentSnapshot[];
  /** The invoice once the order has one: its lookup code goes on a reprinted bill. */
  readonly einvoice?: OrderEInvoiceSnapshot;
}
