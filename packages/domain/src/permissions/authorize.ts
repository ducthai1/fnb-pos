import { DomainError } from "../errors";
import { FULL_RATE } from "../money";
import type { BasisPoints, Vnd } from "../money";
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
  const { discountRate, amount } = action;
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

function validateGrant(grant: Grant): void {
  const definition = definitionOf(grant.key);
  const threshold = "threshold" in grant ? grant.threshold : undefined;
  if (threshold === undefined) return;
  // Stored data can hold anything, and `in` on a number or null would throw a TypeError
  // instead of the code a bad grant gets.
  const valid =
    typeof threshold !== "object" || threshold === null
      ? false
      : definition.threshold === "max_rate"
        ? "maxRate" in threshold && !("maxAmount" in threshold) && isRate(threshold.maxRate)
        : definition.threshold === "max_amount"
          ? "maxAmount" in threshold &&
            !("maxRate" in threshold) &&
            typeof threshold.maxAmount === "bigint" &&
            threshold.maxAmount >= 0n
          : false;
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
