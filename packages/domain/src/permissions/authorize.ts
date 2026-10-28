import { DomainError } from "../errors";
import { FULL_RATE } from "../money";
import type { BasisPoints, Quantity, Vnd } from "../money";
import {
  type Grant,
  PERMISSION_DEFINITIONS,
  type PermissionDefinition,
  type PermissionKey,
  isPermissionKey,
} from "./permission-catalog";
import { PERMISSIONS_ERROR_CODES } from "./permissions-error-codes";

export type AuthorizationResult = "allowed" | "needs_approval" | "denied";

/**
 * What a staff member is about to do. A rate-limited key carries a discount rate and an
 * amount-limited key an amount of cash, because the decision depends on it; other keys carry
 * neither. Both are CUMULATIVE: judging each action on its own let anyone go past a cap in
 * small steps (three 10% discounts on one tea, ten 500.000 đ cash moves).
 */
export interface PermissionAction {
  readonly key: PermissionKey;
  /**
   * The rate the scope is discounted by once this discount is added, everything already on it
   * included: projectedDiscountRate (the item for line_discount, the order for order_discount).
   */
  readonly discountRate?: BasisPoints;
  /**
   * For cash_move: the cash this staff member has moved in the current shift once this move is
   * made, this one included, every move counted as a magnitude (in or out alike). The domain
   * has no shift yet, so the caller adds it up from the shift's cash moves.
   */
  readonly amount?: Vnd;
  /**
   * For accept_close_difference: counted − expected, signed. It decides nothing here (the key
   * is held or not), but it is what a manager approves, so an approval matches one figure
   * and the approval route refuses to grant one that names none.
   */
  readonly difference?: Vnd;
  /** For refund: the money handed back to the customer, which is what a manager approves. */
  readonly refundAmount?: Vnd;
  /** For void_after_sent: the units taken back from the kitchen, which a manager approves. */
  readonly voidedQuantity?: Quantity;
  /** For open_price: the price typed for one unit of the line, which a manager approves. */
  readonly enteredPrice?: Vnd;
  /**
   * What the action is done to (see PermissionDefinition.subject). It decides nothing here,
   * but an approval is given for one subject and covers no other (approval-coverage).
   */
  readonly subject?: ApprovalSubject;
}

/** The order (and line) or shift an action is done to; ids as the server stores them. */
export interface ApprovalSubject {
  readonly orderId?: string;
  readonly lineId?: string;
  readonly shiftId?: string;
}

/**
 * allowed: a grant covers the key and the value is within its threshold.
 * needs_approval: no grant covers it, but the key may be approved on the spot.
 * denied: no grant covers it and nobody can lend it.
 * Several grants of one key (from several roles) widen each other: the most generous wins.
 * Grants are checked as a whole first, since they come from stored role data and a
 * corrupt one must fail loudly rather than silently grant or withhold.
 */
export function authorize(action: PermissionAction, grants: readonly Grant[]): AuthorizationResult {
  const definition = definitionOf(action.key);
  const measured = measuredValue(action, definition);
  validateGrants(grants);
  const covered = grants.some(
    (grant) => grant.key === action.key && withinThreshold(grant, measured),
  );
  if (covered) return "allowed";
  return definition.approvable ? "needs_approval" : "denied";
}

/**
 * The approver must be allowed the very same action on their own, threshold included: a
 * manager capped at 20% cannot approve a 30% discount. Keys that are never lent cannot be
 * approved by anyone, even the owner, so an approval prompt cannot become a back door.
 */
export function canApprove(action: PermissionAction, approverGrants: readonly Grant[]): boolean {
  const result = authorize(action, approverGrants);
  return definitionOf(action.key).approvable && result === "allowed";
}

/**
 * Checks grants read from stored or submitted role data against the catalog: known keys
 * only, and a threshold only of the kind its key is judged by. Throws on the first bad one.
 */
export function validateGrants(grants: readonly Grant[]): void {
  grants.forEach(validateGrant);
}

function definitionOf(key: string): PermissionDefinition {
  if (!isPermissionKey(key)) {
    throw new DomainError(PERMISSIONS_ERROR_CODES.unknownKey, `unknown permission key: ${key}`, {
      key,
    });
  }
  return PERMISSION_DEFINITIONS[key];
}

function measuredValue(
  action: PermissionAction,
  definition: PermissionDefinition,
): number | bigint | undefined {
  const fail = (reason: string): never => {
    throw new DomainError(PERMISSIONS_ERROR_CODES.invalidActionValue, `${action.key}: ${reason}`, {
      key: action.key,
      reason,
    });
  };
  const { discountRate, amount, difference, refundAmount, voidedQuantity, enteredPrice } = action;
  // Optional here: whether a key is held does not depend on them (a backoffice check asks
  // just that). An approval for the key must name them, which the approval route enforces.
  if (difference !== undefined) {
    if (definition.figure !== "difference") fail("unexpected difference");
    if (typeof difference !== "bigint") fail("difference must be an amount");
  }
  if (refundAmount !== undefined) {
    if (definition.figure !== "refund_amount") fail("unexpected refund amount");
    if (typeof refundAmount !== "bigint" || refundAmount < 0n) {
      fail("refund amount must be a non-negative amount");
    }
  }
  if (voidedQuantity !== undefined) {
    if (definition.figure !== "voided_quantity") fail("unexpected voided quantity");
    if (typeof voidedQuantity !== "bigint" || voidedQuantity <= 0n) {
      fail("voided quantity must be positive");
    }
  }
  if (enteredPrice !== undefined) {
    if (definition.figure !== "entered_price") fail("unexpected entered price");
    if (typeof enteredPrice !== "bigint" || enteredPrice < 0n) {
      fail("entered price must be a non-negative amount");
    }
  }
  if (definition.threshold !== "max_rate" && discountRate !== undefined) fail("unexpected rate");
  if (definition.threshold !== "max_amount" && amount !== undefined) fail("unexpected amount");
  if (definition.threshold === "max_rate") {
    if (discountRate === undefined) return fail("missing rate");
    if (!isRate(discountRate)) fail("rate out of range");
    return discountRate;
  }
  if (definition.threshold === "max_amount") {
    if (amount === undefined) return fail("missing amount");
    if (typeof amount !== "bigint" || amount < 0n) fail("amount must be a non-negative magnitude");
    return amount;
  }
  return undefined;
}

/** The one field a threshold of each kind holds. */
const THRESHOLD_FIELD = { max_rate: "maxRate", max_amount: "maxAmount" } as const;

function validateGrant(grant: Grant): void {
  const definition = definitionOf(grant.key);
  const threshold: unknown = "threshold" in grant ? grant.threshold : undefined;
  if (threshold === undefined) return;
  // Exactly the field the key is judged by: a rate cap that also carries an amount (or any other
  // field) is not a cap anyone wrote on purpose, and which of the two would bind is a guess.
  // Stored data can hold anything, so a number or null is checked before reading its fields.
  const field =
    definition.threshold === undefined ? undefined : THRESHOLD_FIELD[definition.threshold];
  const fields = typeof threshold === "object" && threshold !== null ? threshold : {};
  const value: unknown =
    field === undefined ? undefined : (fields as Record<string, unknown>)[field];
  const valid =
    field !== undefined &&
    Object.keys(fields).length === 1 &&
    Object.hasOwn(fields, field) &&
    (field === "maxRate" ? isRate(value) : typeof value === "bigint" && value >= 0n);
  if (!valid) {
    throw new DomainError(
      PERMISSIONS_ERROR_CODES.invalidGrant,
      `${grant.key}: threshold does not fit the key`,
      { key: grant.key, threshold },
    );
  }
}

function withinThreshold(grant: Grant, measured: number | bigint | undefined): boolean {
  const threshold = "threshold" in grant ? grant.threshold : undefined;
  if (threshold === undefined || measured === undefined) return true;
  const limit = "maxRate" in threshold ? threshold.maxRate : threshold.maxAmount;
  return measured <= limit;
}

function isRate(value: unknown): value is BasisPoints {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= FULL_RATE;
}
