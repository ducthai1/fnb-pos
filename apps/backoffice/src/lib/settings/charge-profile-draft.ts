import { posChargeProfileSchema } from "@fnb/contracts";
import { parsePercentText } from "../format/percent-text";

/** The channels a service charge can apply to, in the order the form lists them. */
export const SERVICE_CHANNELS = ["dine_in", "takeaway", "delivery_self", "delivery_platform"] as const;
export type ServiceChannel = (typeof SERVICE_CHANNELS)[number];

export type ServiceChargeBase = "before_discount" | "after_discount";

/** The charge profile form as typed: rates as the person writes them ("5", "8,5"). */
export interface ChargeProfileDraft {
  readonly pricesIncludeTax: boolean;
  readonly serviceChargeOn: boolean;
  readonly rate: string;
  readonly appliesTo: readonly ServiceChannel[];
  readonly base: ServiceChargeBase;
  readonly taxRate: string;
}

export type ChargeProfileField = "rate" | "appliesTo" | "taxRate";

export type ChargeProfileCheck =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly errors: Partial<Record<ChargeProfileField, true>> };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The form for a stored profile; anything unreadable starts from the café default. */
export function chargeProfileDraftOf(value: unknown): ChargeProfileDraft {
  const stored = isRecord(value) ? value : {};
  const charge = isRecord(stored.serviceCharge) ? stored.serviceCharge : null;
  const channels = Array.isArray(charge?.appliesTo) ? charge.appliesTo : [];
  return {
    pricesIncludeTax: stored.pricesIncludeTax !== false,
    serviceChargeOn: charge !== null,
    rate: typeof charge?.rate === "number" ? String(charge.rate / 100) : "",
    appliesTo: SERVICE_CHANNELS.filter((channel) => channels.includes(channel)),
    base: charge?.base === "after_discount" ? "after_discount" : "before_discount",
    taxRate: typeof charge?.taxRate === "number" ? String(charge.taxRate / 100) : "",
  };
}

/**
 * The profile to send, or which fields are not right yet. Rates go through the domain's
 * percent rule, and the whole value through the contract the server checks it with, so a
 * profile the form accepts is one the server takes.
 */
export function checkChargeProfileDraft(draft: ChargeProfileDraft): ChargeProfileCheck {
  if (!draft.serviceChargeOn) {
    return { ok: true, value: { pricesIncludeTax: draft.pricesIncludeTax, serviceCharge: null } };
  }
  const rate = parsePercentText(draft.rate);
  const taxRate = parsePercentText(draft.taxRate);
  const errors: Partial<Record<ChargeProfileField, true>> = {};
  if (rate === null || rate === 0) errors.rate = true;
  if (taxRate === null) errors.taxRate = true;
  if (draft.appliesTo.length === 0) errors.appliesTo = true;
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const value = {
    pricesIncludeTax: draft.pricesIncludeTax,
    serviceCharge: { rate, appliesTo: [...draft.appliesTo], base: draft.base, taxRate },
  };
  if (!posChargeProfileSchema.safeParse(value).success) return { ok: false, errors: { rate: true } };
  return { ok: true, value };
}
