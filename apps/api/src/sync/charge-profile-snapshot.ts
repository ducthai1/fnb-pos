import { type OrderChargeProfile, type ServiceType, basisPoints } from "@fnb/domain";
import { z } from "zod";
import type { ChargeProfileSnapshot } from "./sync-wire-types";

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

/**
 * A stored profile (on an order, or the charge_profile setting) as the domain prices with
 * it; throws if the value is damaged.
 */
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
