import { type OrderChargeProfile, type ServiceType, basisPoints } from "@fnb/domain";
import { z } from "zod";
import type { ChargeProfileSnapshot } from "./sync-wire-types";

/**
 * The profile a new order is priced with. Branches have no setting for it yet, so every
 * order gets the café default: menu prices include VAT, no service charge. It is stored on
 * the order, so introducing the setting later never reprices orders already taken.
 */
export const DEFAULT_CHARGE_PROFILE: OrderChargeProfile = {
  pricesIncludeTax: true,
  serviceCharge: null,
};

export function chargeProfileToSnapshot(profile: OrderChargeProfile): ChargeProfileSnapshot {
  const rule = profile.serviceCharge;
  return {
    pricesIncludeTax: profile.pricesIncludeTax,
    serviceCharge:
      rule === null
        ? null
        : {
            rate: rule.rate,
            appliesTo: [...rule.appliesTo],
            base: rule.base,
            taxRate: rule.taxRate,
          },
  };
}

const storedProfileSchema = z.object({
  pricesIncludeTax: z.boolean(),
  serviceCharge: z
    .object({
      rate: z.number().int(),
      appliesTo: z.array(z.enum(["dine_in", "takeaway", "delivery_self", "delivery_platform"])),
      base: z.enum(["before_discount", "after_discount"]),
      taxRate: z.number().int(),
    })
    .nullable(),
});

/** The profile stored on an order, as the domain prices with it; throws if the row is damaged. */
export function chargeProfileFromStored(stored: unknown): OrderChargeProfile {
  const profile = storedProfileSchema.parse(stored);
  const rule = profile.serviceCharge;
  return {
    pricesIncludeTax: profile.pricesIncludeTax,
    serviceCharge:
      rule === null
        ? null
        : {
            rate: basisPoints(rule.rate),
            appliesTo: rule.appliesTo satisfies ServiceType[],
            base: rule.base,
            taxRate: basisPoints(rule.taxRate),
          },
  };
}
