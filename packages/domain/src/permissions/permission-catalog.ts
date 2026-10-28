import type { BasisPoints, Vnd } from "../money";

/**
 * Sensitive actions only. Taking an order, sending it to the bar or taking payment need
 * no key: every signed-in staff member may do them, so they are not listed here.
 */
export const PERMISSION_KEYS = [
  "refund",
  "void_after_sent",
  "line_discount",
  "order_discount",
  "price_override",
  "open_price",
  "comp_item",
  "cash_move",
  "open_drawer",
  "accept_close_difference",
  "reopen_paid_order",
  "transfer_table",
  "close_unpaid_table",
  "view_reports",
  "edit_menu",
  "stock_adjust",
  "manage_staff",
  "manage_devices",
  "manage_settings",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

/** Keys whose grant may cap the discount rate a holder can give alone. */
export type RateLimitedPermissionKey = "line_discount" | "order_discount";
/** Keys whose grant may cap the amount of cash a holder can move alone. */
export type AmountLimitedPermissionKey = "cash_move";
export type UnlimitedPermissionKey = Exclude<
  PermissionKey,
  RateLimitedPermissionKey | AmountLimitedPermissionKey
>;

export type PermissionThresholdKind = "max_rate" | "max_amount";

/**
 * What an on-the-spot approval of a key is given for: one line of one order, one order, or
 * one shift. A manager agrees to "this refund of this sale", never to "a refund".
 */
export type ApprovalSubjectKind = "order_line" | "order" | "shift";

/** The figure an approval of a key names besides its rate or cash total. */
export type ApprovalFigureKind =
  | "difference"
  | "refund_amount"
  | "voided_quantity"
  | "entered_price";

export interface PermissionDefinition {
  /**
   * Whether someone who holds the key may approve it on the spot for someone who does not
   * (a manager entering a PIN on the cashier's till). Administration keys are not: they
   * change who can do what, so they are done by their holder in person, never lent.
   */
  readonly approvable: boolean;
  readonly threshold?: PermissionThresholdKind;
  /**
   * The figure an action of this key names, which an approval is given for and must match:
   * not a cap, just what was agreed to (the close difference a manager accepted, the money a
   * refund hands back, the units a void takes back from the kitchen, the price a cashier typed).
   */
  readonly figure?: ApprovalFigureKind;
  /** What an approval of this key is bound to; none for keys whose use names nothing. */
  readonly subject?: ApprovalSubjectKind;
}

export const PERMISSION_DEFINITIONS: Readonly<Record<PermissionKey, PermissionDefinition>> = {
  refund: { approvable: true, figure: "refund_amount", subject: "order" },
  void_after_sent: { approvable: true, figure: "voided_quantity", subject: "order_line" },
  line_discount: { approvable: true, threshold: "max_rate", subject: "order_line" },
  order_discount: { approvable: true, threshold: "max_rate", subject: "order" },
  price_override: { approvable: true },
  open_price: { approvable: true, figure: "entered_price", subject: "order_line" },
  comp_item: { approvable: true },
  cash_move: { approvable: true, threshold: "max_amount", subject: "shift" },
  open_drawer: { approvable: true, subject: "shift" },
  accept_close_difference: { approvable: true, figure: "difference", subject: "shift" },
  reopen_paid_order: { approvable: true },
  transfer_table: { approvable: true, subject: "order" },
  close_unpaid_table: { approvable: true, subject: "order" },
  stock_adjust: { approvable: true },
  // Reports are access to data, not a one-off action: approving one would show the whole
  // report to the person who asked, so they are never lent.
  view_reports: { approvable: false },
  edit_menu: { approvable: false },
  manage_staff: { approvable: false },
  manage_devices: { approvable: false },
  manage_settings: { approvable: false },
};

/**
 * One permission held by a role. A grant on a limited key without a threshold means no
 * limit; with one, the holder acts alone up to it (inclusive) and needs approval above.
 */
export type Grant =
  | {
      readonly key: RateLimitedPermissionKey;
      readonly threshold?: { readonly maxRate: BasisPoints };
    }
  | { readonly key: AmountLimitedPermissionKey; readonly threshold?: { readonly maxAmount: Vnd } }
  | { readonly key: UnlimitedPermissionKey };

export function isPermissionKey(key: string): key is PermissionKey {
  return (PERMISSION_KEYS as readonly string[]).includes(key);
}
