import { basisPoints, vnd } from "../money";
import type { PermissionAction } from "./authorize";
import { type Grant, PERMISSION_DEFINITIONS, type PermissionKey } from "./permission-catalog";

/* Test-only helpers shared by the permission tests; not exported from the package. */

/** The action for `key`, carrying the value its threshold kind needs. */
export function actionFor(key: PermissionKey, value = 0): PermissionAction {
  const threshold = PERMISSION_DEFINITIONS[key].threshold;
  if (threshold === "max_rate") return { key, discountRate: basisPoints(value) };
  if (threshold === "max_amount") return { key, amount: vnd(value) };
  return { key };
}

export const rateGrant = (key: "line_discount" | "order_discount", maxRate: number): Grant => ({
  key,
  threshold: { maxRate: basisPoints(maxRate) },
});

export const cashGrant = (maxAmount: number): Grant => ({
  key: "cash_move",
  threshold: { maxAmount: vnd(maxAmount) },
});

/** Bypasses the types to model grants or actions read from stored, possibly corrupt data. */
export const corrupt = <T>(value: unknown): T => value as T;
