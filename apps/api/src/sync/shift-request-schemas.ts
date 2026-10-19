import { z } from "zod";
import { uuidSchema as idSchema, wholeDongSchema as amountSchema } from "@fnb/contracts";

/**
 * Notes counted, one row per denomination. Which denominations exist is the domain's rule,
 * so an unknown one is answered with its code rather than as a malformed payload.
 */
const countSchema = z
  .array(
    z.object({
      denomination: amountSchema.positive(),
      pieces: z.number().int().min(0).max(1_000_000),
    }),
  )
  .max(20);

export const openShiftPayloadSchema = z.object({
  /** Made on the till, so the shift has its id before it ever syncs. */
  shiftId: idSchema,
  openingCash: amountSchema.nonnegative(),
  denominations: countSchema.optional(),
});

export type OpenShiftPayload = z.infer<typeof openShiftPayloadSchema>;

export const cashMovePayloadSchema = z.object({
  cashMoveId: idSchema,
  kind: z.enum(["in", "out"]),
  amount: amountSchema.positive(),
  reason: z.string().trim().min(1).max(200),
  approvalId: idSchema.optional(),
});

export type CashMovePayload = z.infer<typeof cashMovePayloadSchema>;

export const closeShiftPayloadSchema = z.object({
  /** What the cashier says the drawer holds; the server checks it against the notes. */
  counted: amountSchema.nonnegative(),
  denominations: countSchema,
  approvalId: idSchema.optional(),
});

export type CloseShiftPayload = z.infer<typeof closeShiftPayloadSchema>;
