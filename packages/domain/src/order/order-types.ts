import type { BasisPoints, Quantity, Vnd } from "../money";

/**
 * draft → paid → posted, or draft → cancelled. A paid order is a closed document:
 * it is corrected with a reversing document, never edited (see order-state-machine.ts).
 */
export type OrderStatus = "draft" | "paid" | "posted" | "cancelled";

export type ServiceType = "dine_in" | "takeaway" | "delivery_self" | "delivery_platform";

/**
 * - `item`: a product sold on the order; always a root line
 * - `modifier`: an option (topping, size, sugar level) on an item or a combo component
 * - `combo_component`: a product picked inside a combo item
 * - `discount`: a root discount reduces the whole order, one under an item reduces that line
 */
export type OrderLineType = "item" | "modifier" | "combo_component" | "discount";

/** Where unitPrice came from, kept so a refund or an audit can explain the price later. */
export type PriceSource = "base" | "price_list" | "manual" | "promotion";

export interface OrderLine {
  readonly id: string;
  /** null for a root line; see validateLineTree for which line types may hang under which. */
  readonly parentLineId: string | null;
  readonly lineType: OrderLineType;
  readonly productId: string | null;
  readonly variantId: string | null;
  readonly modifierOptionId: string | null;
  /** The name at the time of sale: renaming a product later must not rewrite old receipts. */
  readonly nameSnapshot: string;
  readonly unitPrice: Vnd;
  /** On a child line this is per ONE unit of the parent line; see effectiveQuantity. */
  readonly quantity: Quantity;
  readonly taxRate: BasisPoints;
  readonly note: string | null;
  readonly priceSource: PriceSource;
  /**
   * Set only on a negative root item: the line whose units it takes back. A line that was
   * already sent to the kitchen or paid for is never shrunk in place, because the ticket or
   * receipt that showed it must stay explainable; a negative line cancels part of it instead.
   * On a refund order it points at a line of the refunded order, not of this one.
   */
  readonly reversesLineId: string | null;
}

export interface Order {
  readonly id: string;
  readonly status: OrderStatus;
  readonly serviceType: ServiceType;
  readonly channelKey: string | null;
  /** "YYYY-MM-DD" from businessDate: a sale at 01:00 usually belongs to the previous day. */
  readonly businessDate: string;
  readonly lines: readonly OrderLine[];
  /** Set on a refund: the paid order this one reverses. Its negative lines point into that order. */
  readonly refundOfOrderId: string | null;
  /** Set on a refund built by buildRefund: what it gives back; see RefundAmounts. */
  readonly refundAmounts: RefundAmounts | null;
  /** Bumped on every change so concurrent edits from two devices can be detected. */
  readonly version: number;
}

/**
 * What a refund gives back, fixed when it is built. A refund returns what the customer paid for
 * the units, and that is a share of the sale's own amounts, not a fresh pricing of the refund's
 * lines: the sale spread its order discount, rounded its tax once per rate and its service charge
 * once, and pricing each partial refund again would round again, so several refunds of one
 * order would give back a few đồng more or less than it took. The amounts are stored on the
 * refund because they depend on the refunds made before it, which can later change (a draft
 * cancelled), while a paid refund must not.
 */
export interface RefundAmounts {
  /** As on the sale, so the refund reads the same whatever the branch's profile is today. */
  readonly pricesIncludeTax: boolean;
  readonly serviceChargeTaxRate: BasisPoints;
  /** One entry per goods line of the refund. */
  readonly lines: readonly RefundLineAmounts[];
}

/**
 * One goods line of a refund, as the refund's own (negative) amounts: `discountAllocated` is the
 * discount kept back, so `gross - discountAllocated` is the net given back, like LineTotals.
 */
export interface RefundLineAmounts {
  readonly lineId: string;
  /** The sold line these units come from, so a later refund knows what is left of it. */
  readonly soldLineId: string;
  readonly gross: Vnd;
  readonly discountAllocated: Vnd;
  readonly tax: Vnd;
  readonly serviceCharge: Vnd;
  readonly serviceChargeTax: Vnd;
}
