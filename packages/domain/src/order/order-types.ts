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
}

export interface Order {
  readonly id: string;
  readonly status: OrderStatus;
  readonly serviceType: ServiceType;
  readonly channelKey: string | null;
  /** "YYYY-MM-DD" from businessDate: a sale at 01:00 usually belongs to the previous day. */
  readonly businessDate: string;
  readonly lines: readonly OrderLine[];
  /** Bumped on every change so concurrent edits from two devices can be detected. */
  readonly version: number;
}
