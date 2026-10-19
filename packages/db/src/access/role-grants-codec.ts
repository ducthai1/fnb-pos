import { DomainError, type Grant, PERMISSIONS_ERROR_CODES, validateGrants } from "@fnb/domain";

/** One limit as it sits in role.thresholds; money as a decimal string, since JSON has no bigint. */
export type StoredThreshold = { maxRate: number } | { maxAmount: string };

/**
 * A role's grants as its columns hold them: the keys in permission_keys, and the limit of
 * each capped key in thresholds under that key, e.g.
 * `{ line_discount: { maxRate: 1000 }, cash_move: { maxAmount: "500000" } }`.
 */
export interface StoredRoleGrants {
  permissionKeys: string[];
  thresholds: Record<string, StoredThreshold>;
}

// Whole đồng, no sign, no leading zeros, at most 19 digits (fits a bigint column later).
const AMOUNT = /^(?:0|[1-9][0-9]{0,18})$/;

/** The columns for `grants`, which must already be valid: a role is never written corrupt. */
export function encodeRoleGrants(grants: readonly Grant[]): StoredRoleGrants {
  validateGrants(grants);
  rejectDuplicates(grants.map((grant) => grant.key));
  const thresholds: Record<string, StoredThreshold> = {};
  for (const grant of grants) {
    const threshold = "threshold" in grant ? grant.threshold : undefined;
    if (threshold === undefined) continue;
    thresholds[grant.key] =
      "maxRate" in threshold
        ? { maxRate: threshold.maxRate }
        : { maxAmount: threshold.maxAmount.toString() };
  }
  return { permissionKeys: grants.map((grant) => grant.key), thresholds };
}

/**
 * The grants a role's columns hold, checked by the domain. The same function reads a
 * stored row and a role submitted by a client, so what is accepted on write is exactly
 * what can be read back. Anything that does not fit throws a DomainError with a
 * permissions code: a corrupt role must fail loudly, never grant or withhold silently.
 */
export function decodeRoleGrants(permissionKeys: readonly string[], thresholds: unknown): Grant[] {
  if (typeof thresholds !== "object" || thresholds === null || Array.isArray(thresholds)) {
    return invalid("thresholds must be an object keyed by permission key");
  }
  rejectDuplicates(permissionKeys);
  const limits = thresholds as Record<string, unknown>;
  for (const key of Object.keys(limits)) {
    // A limit on a key the role does not hold would read as harmless, yet it would start to
    // apply the day someone adds the key, capping (or uncapping) without anyone deciding.
    if (!permissionKeys.includes(key))
      invalid(`threshold for ${key}, which the role does not hold`);
  }
  const grants = permissionKeys.map((key) => {
    const limit = Object.hasOwn(limits, key) ? limits[key] : undefined;
    return (limit === undefined ? { key } : { key, threshold: decodeThreshold(limit) }) as Grant;
  });
  validateGrants(grants);
  return grants;
}

// Only a well-formed amount string becomes a bigint; anything else is passed on untouched
// so the domain check rejects it with the code a bad threshold gets.
function decodeThreshold(limit: unknown): unknown {
  if (typeof limit !== "object" || limit === null || !("maxAmount" in limit)) return limit;
  const { maxAmount } = limit as { maxAmount: unknown };
  if (typeof maxAmount !== "string" || !AMOUNT.test(maxAmount)) return limit;
  return { ...limit, maxAmount: BigInt(maxAmount) };
}

function rejectDuplicates(keys: readonly string[]): void {
  // One key, one row of limits: two grants of a key could not both be stored.
  if (new Set(keys).size !== keys.length) invalid("a permission key is listed twice");
}

function invalid(reason: string): never {
  throw new DomainError(PERMISSIONS_ERROR_CODES.invalidGrant, reason, { reason });
}
