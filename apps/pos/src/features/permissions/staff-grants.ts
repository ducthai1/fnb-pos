import { type Grant, isDomainError, validateGrants, vnd } from "@fnb/domain";

const AMOUNT = /^(?:0|[1-9][0-9]{0,18})$/;

/** One stored limit as the API writes it: money as a decimal string, JSON having no bigint. */
function thresholdOf(limit: unknown): unknown {
  if (typeof limit !== "object" || limit === null || !("maxAmount" in limit)) return limit;
  const { maxAmount } = limit as { maxAmount: unknown };
  if (typeof maxAmount !== "string" || !AMOUNT.test(maxAmount)) return limit;
  return { maxAmount: vnd(BigInt(maxAmount)) };
}

/**
 * The signed-in staff member's grants from GET /pos/staff-sessions/current
 * (`{ grants: { permissionKeys, thresholds } }`), checked by the domain, or null when the
 * body is not that. A role the till cannot read grants nothing: every sensitive action then
 * asks for a manager, rather than the till guessing what the role allows.
 */
export function parseStaffGrants(body: unknown): Grant[] | null {
  const grants = (body as { grants?: unknown } | null)?.grants;
  if (typeof grants !== "object" || grants === null) return null;
  const { permissionKeys, thresholds } = grants as Record<string, unknown>;
  if (!Array.isArray(permissionKeys) || typeof thresholds !== "object" || thresholds === null) {
    return null;
  }
  const limits = thresholds as Record<string, unknown>;
  if (Object.keys(limits).some((key) => !permissionKeys.includes(key))) return null;
  const parsed = permissionKeys.map((key: unknown) => {
    if (typeof key !== "string") return null;
    return Object.hasOwn(limits, key) ? { key, threshold: thresholdOf(limits[key]) } : { key };
  });
  if (parsed.some((grant) => grant === null)) return null;
  try {
    validateGrants(parsed as Grant[]);
    return parsed as Grant[];
  } catch (error) {
    if (isDomainError(error)) return null;
    throw error;
  }
}
