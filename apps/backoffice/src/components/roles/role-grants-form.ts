import { PERMISSION_DEFINITIONS, PERMISSION_KEYS, type PermissionKey, percentRate } from "@fnb/domain";
import type { Role, RoleGrantsBody, StoredThreshold } from "../../lib/api/roles-api";
import { amountInputText, parseAmountText } from "../../lib/format/amount-text";
import { vi } from "../../messages/vi";

const NAME_MAX = 80;
const PERCENT = /^\d{1,3}(?:[.,]\d{1,2})?$/;

/** What the role editor holds: the keys ticked, and the limit typed next to each capped key. */
export interface RoleGrantsForm {
  readonly name: string;
  readonly keys: readonly PermissionKey[];
  /** Percent ("12,5") for a rate-capped key, đồng ("500.000") for an amount-capped one. */
  readonly limits: Readonly<Partial<Record<PermissionKey, string>>>;
}

export type RoleGrantsErrors = Partial<Record<PermissionKey | "name", string>>;

const kindOf = (key: PermissionKey) => PERMISSION_DEFINITIONS[key].threshold;

function limitText(key: PermissionKey, stored: StoredThreshold | undefined): string {
  if (stored === undefined) return "";
  if ("maxRate" in stored && kindOf(key) === "max_rate") return String(stored.maxRate / 100);
  if ("maxAmount" in stored && kindOf(key) === "max_amount") {
    const amount = parseAmountText(stored.maxAmount);
    return amount === null ? stored.maxAmount : amountInputText(Number(amount));
  }
  return "";
}

/** The editor's starting point: an existing role as stored, or an empty new one. */
export function roleGrantsFormOf(role: Role | null): RoleGrantsForm {
  if (role === null) return { name: "", keys: [], limits: {} };
  const keys = PERMISSION_KEYS.filter((key) => role.permissionKeys.includes(key));
  const limits: Partial<Record<PermissionKey, string>> = {};
  for (const key of keys) {
    if (kindOf(key) !== undefined) limits[key] = limitText(key, role.thresholds[key]);
  }
  return { name: role.name, keys, limits };
}

function parseRate(text: string): number | null {
  if (!PERCENT.test(text)) return null;
  try {
    return percentRate(Number(text.replace(",", ".")));
  } catch {
    return null;
  }
}

/**
 * The body PATCH/POST /roles takes, or what to fix. A limit applies only to a ticked key
 * (the API refuses a limit on a key the role does not hold); a blank limit means none.
 */
export function roleGrantsBody(
  form: RoleGrantsForm,
): { ok: true; body: RoleGrantsBody } | { ok: false; errors: RoleGrantsErrors } {
  const errors: RoleGrantsErrors = {};
  const name = form.name.trim();
  if (name === "") errors.name = vi.common.nameMissing;
  else if (name.length > NAME_MAX) errors.name = vi.common.nameTooLong(NAME_MAX);
  const permissionKeys = PERMISSION_KEYS.filter((key) => form.keys.includes(key));
  const thresholds: Record<string, StoredThreshold> = {};
  for (const key of permissionKeys) {
    const text = (form.limits[key] ?? "").trim();
    const kind = kindOf(key);
    if (text === "" || kind === undefined) continue;
    if (kind === "max_rate") {
      const maxRate = parseRate(text);
      if (maxRate === null) errors[key] = vi.roles.rateInvalid;
      else thresholds[key] = { maxRate };
    } else {
      const amount = parseAmountText(text);
      if (amount === null) errors[key] = vi.common.amountInvalid;
      else thresholds[key] = { maxAmount: amount.toString() };
    }
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, body: { name, permissionKeys, thresholds } };
}
