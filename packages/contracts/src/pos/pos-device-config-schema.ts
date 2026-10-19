import type { OrderChargeProfile } from "@fnb/domain";
import { z } from "zod";
import { idSchema } from "../catalog/catalog-schema-parts";
import { rateSchema } from "../primitives/rate-schema";
import { feedVersionSchema } from "./pos-feed-version-schema";

const serviceChargeSchema = z
  .object({
    rate: rateSchema,
    appliesTo: z.array(z.enum(["dine_in", "takeaway", "delivery_self", "delivery_platform"])),
    base: z.enum(["before_discount", "after_discount"]),
    taxRate: rateSchema,
  })
  .strict();

/** How a new order opened on the till is priced; it keeps this profile for good. */
export const posChargeProfileSchema = z
  .object({ pricesIncludeTax: z.boolean(), serviceCharge: serviceChargeSchema.nullable() })
  .strict()
  .transform((profile): OrderChargeProfile => profile);

/**
 * The till's settings after inheritance (its own value, else its branch's, else its
 * brand's, else the built-in default), so the till never resolves layers itself and two
 * tills of one branch cannot disagree on how they combine. Keyed by the till's device id.
 */
export const posDeviceConfigSchema = z
  .object({
    id: idSchema,
    version: feedVersionSchema,
    /** Every feature switch, on or off. */
    flags: z.record(z.string(), z.boolean()),
    /** Every other setting as stored (money settings are decimal strings), the profile aside. */
    settings: z.record(z.string(), z.unknown()),
    chargeProfile: posChargeProfileSchema,
  })
  .strict();

export type PosDeviceConfig = z.output<typeof posDeviceConfigSchema>;
export type PosDeviceConfigWire = z.input<typeof posDeviceConfigSchema>;
