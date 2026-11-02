import { z } from "zod";
import { quantitySchema } from "../../primitives/quantity-schema";
import { uuidSchema } from "../../primitives/uuid-schema";
import { reasonCodeSchema, reasonNoteSchema } from "./command-payload-parts";

/**
 * order.void_line: cancel units of a sold item on a draft. The intent only: the server
 * works out which units the kitchen already has, and builds any cancel line itself, under
 * the id the till gave it (reversalLineId) when the till names one.
 */
export const voidLinePayloadSchema = z.object({
  orderId: uuidSchema,
  lineId: uuidSchema,
  quantity: quantitySchema,
  reasonCode: reasonCodeSchema,
  /** What happened, in the staff member's words; needed when the reason is "other". */
  reasonNote: reasonNoteSchema.optional(),
  /** A manager's approval, needed when units the kitchen has are cancelled. */
  approvalId: uuidSchema.optional(),
  /**
   * The id the till gave the cancel line on its own copy, which its cancel ticket was printed
   * and recorded under, offline too: the server's cancel line takes it, so the ticket the
   * station already has is never owed a second time. Left out by older tills: the server
   * then makes its own id, as before.
   */
  reversalLineId: uuidSchema.optional(),
});

export type VoidLinePayload = z.infer<typeof voidLinePayloadSchema>;
