import { z } from "zod";
import { wholeDongSchema } from "../../primitives/money-schema";
import { uuidSchema } from "../../primitives/uuid-schema";

/**
 * Notes counted, one row per denomination. Which denominations exist is the domain's rule,
 * so an unknown one is answered with its code rather than as a malformed payload.
 */
const countSchema = z
  .array(
    z.object({
      denomination: wholeDongSchema.positive(),
      pieces: z.number().int().min(0).max(1_000_000),
    }),
  )
  .max(20);

/** shift.open: the till's drawer starts a shift on the float the cashier counted. */
export const openShiftPayloadSchema = z.object({
  /** Made on the till, so the shift has its id before it ever syncs. */
  shiftId: uuidSchema,
  openingCash: wholeDongSchema.nonnegative(),
  denominations: countSchema.optional(),
});

export type OpenShiftPayload = z.infer<typeof openShiftPayloadSchema>;

/** shift.cash_move: cash put into or taken out of the drawer outside a sale. */
export const cashMovePayloadSchema = z.object({
  cashMoveId: uuidSchema,
  kind: z.enum(["in", "out"]),
  amount: wholeDongSchema.positive(),
  reason: z.string().trim().min(1).max(200),
  /** A manager's approval, for a move past what the staff member may move alone. */
  approvalId: uuidSchema.optional(),
});

export type CashMovePayload = z.infer<typeof cashMovePayloadSchema>;

/** shift.close: the cashier's count of the drawer, which settles the shift. */
export const closeShiftPayloadSchema = z.object({
  /** What the cashier says the drawer holds; the server checks it against the notes. */
  counted: wholeDongSchema.nonnegative(),
  denominations: countSchema,
  /** A manager's approval, for a difference beyond the till's tolerance. */
  approvalId: uuidSchema.optional(),
});

export type CloseShiftPayload = z.infer<typeof closeShiftPayloadSchema>;
