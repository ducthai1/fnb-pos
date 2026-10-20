import type { ApiFailure } from "../api/api-result";
import { isRecord, textOf } from "../api/read-json-fields";
import type { ConfigScopeKind } from "../api/settings-api";

/**
 * A switch rule the server refused a write for: `flag` needs `other` on (requires), or the
 * two cannot both be on (excludes), at the brand, branch or till named, which may be below
 * the scope written (a brand switch conflicting with what one branch set).
 */
export interface FlagViolation {
  readonly rule: "requires" | "excludes";
  readonly flag: string;
  readonly other: string;
  readonly scopeKind: ConfigScopeKind;
  readonly scopeId: string;
}

const RULES: Readonly<Record<string, FlagViolation["rule"]>> = {
  FLAGS_REQUIRES_MISSING: "requires",
  FLAGS_EXCLUDES_BOTH_ON: "excludes",
};

const SCOPE_KINDS: readonly string[] = ["brand", "branch", "device"];

/** The violation a refused switch write carries in `details`, or null for any other failure. */
export function flagViolationOf(failure: ApiFailure): FlagViolation | null {
  if (failure.status !== 400 || failure.code === null || !Object.hasOwn(RULES, failure.code)) return null;
  const details = isRecord(failure.body) ? failure.body.details : null;
  if (!isRecord(details)) return null;
  const flag = textOf(details, "flag");
  const other = textOf(details, "other");
  const scopeKind = textOf(details, "scopeKind");
  const scopeId = textOf(details, "scopeId");
  if (flag === null || other === null || scopeId === null) return null;
  if (scopeKind === null || !SCOPE_KINDS.includes(scopeKind)) return null;
  return {
    rule: RULES[failure.code]!,
    flag,
    other,
    scopeKind: scopeKind as ConfigScopeKind,
    scopeId,
  };
}
