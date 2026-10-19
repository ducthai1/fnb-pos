import { z } from "zod";
import { channelKeySchema, idSchema, instantSchema } from "./catalog-schema-parts";

/** A manual "86": a product switched off (or back on) at a branch. */
export const availabilityBodySchema = z
  .object({
    productId: idSchema,
    branchId: idSchema,
    /** null: every channel at the branch; otherwise just that one (e.g. a delivery app). */
    channelKey: channelKeySchema.nullable().default(null),
    available: z.boolean(),
    /** When the product comes back on its own; null keeps it off until someone puts it back. */
    unavailableUntil: instantSchema.nullable().default(null),
  })
  .strict()
  .refine((body) => !body.available || body.unavailableUntil === null);

export type AvailabilityBodyInput = z.infer<typeof availabilityBodySchema>;
