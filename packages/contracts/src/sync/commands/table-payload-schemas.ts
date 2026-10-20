import { z } from "zod";
import { uuidSchema } from "../../primitives/uuid-schema";

/**
 * table.transfer: the guests of a draft move to another table, their order with them. The
 * target must be free (moving onto an occupied table would merge two bills); lines keep
 * what the kitchen already has, so nothing is printed again.
 */
export const transferTablePayloadSchema = z.object({
  orderId: uuidSchema,
  toTableId: uuidSchema,
  /** A manager's approval when the staff member may not move guests alone. */
  approvalId: uuidSchema.optional(),
});

/**
 * order.mark_pre_bill_printed: the till printed the pre-bill of a draft as it now stands,
 * so its table shows as waiting to pay until the order changes again. `printedVersion` is
 * the version of the order the slip shows: another till may have changed the order before
 * this mark arrives, and the guests' slip then lacks what it added.
 */
export const markPreBillPrintedPayloadSchema = z.object({
  orderId: uuidSchema,
  printedVersion: z.number().int().positive().optional(),
});

export type TransferTablePayload = z.infer<typeof transferTablePayloadSchema>;
export type MarkPreBillPrintedPayload = z.infer<typeof markPreBillPrintedPayloadSchema>;
