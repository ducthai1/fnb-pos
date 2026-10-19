import { basisPoints, vnd } from "../money";
import { type Grant, PERMISSION_KEYS, type PermissionKey } from "./permission-catalog";

export type RoleTemplateKey =
  "owner" | "manager" | "cashier" | "waiter" | "barista" | "stock_keeper";

/**
 * A starting set of grants for a new shop. Shops copy and edit these into their own roles;
 * display names live in the UI messages, not here.
 */
export interface RoleTemplate {
  readonly key: RoleTemplateKey;
  readonly grants: readonly Grant[];
}

const unlimited = (...keys: PermissionKey[]): Grant[] => keys.map((key) => ({ key }) as Grant);

// The owner is the only one who can change roles, devices and settings, so nobody below
// can widen their own rights or pair a till the owner does not know about.
const owner: RoleTemplate = { key: "owner", grants: unlimited(...PERMISSION_KEYS) };

// A shift manager runs the floor alone at night: refunds, voids, discounts, cash and the
// shift close all happen without the owner. Menu prices and staff stay with the owner,
// because a manager who can edit both can hide what was really charged.
const manager: RoleTemplate = {
  key: "manager",
  grants: unlimited(
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
    "stock_adjust",
  ),
};

// The cashier handles the everyday small things alone: a small line discount for a
// regular, an open-priced extra, paying the ice or milk delivery from the drawer. Anything
// that takes money back out of a closed sale, or opens the drawer without one, needs a
// manager, because those are the classic ways cash goes missing at a counter.
const cashier: RoleTemplate = {
  key: "cashier",
  grants: [
    { key: "line_discount", threshold: { maxRate: basisPoints(1_000) } },
    { key: "cash_move", threshold: { maxAmount: vnd(500_000) } },
    ...unlimited("open_price", "transfer_table"),
  ],
};

// Waiters seat and move guests; everything touching money goes through the cashier.
const waiter: RoleTemplate = { key: "waiter", grants: unlimited("transfer_table") };

// Baristas make what the tickets say; making drinks needs no key, and a spilled cup is
// recorded by whoever holds stock_adjust.
const barista: RoleTemplate = { key: "barista", grants: [] };

// The stock keeper counts and corrects stock but sees no sales figures.
const stockKeeper: RoleTemplate = { key: "stock_keeper", grants: unlimited("stock_adjust") };

export const ROLE_TEMPLATES: Readonly<Record<RoleTemplateKey, RoleTemplate>> = {
  owner,
  manager,
  cashier,
  waiter,
  barista,
  stock_keeper: stockKeeper,
};
