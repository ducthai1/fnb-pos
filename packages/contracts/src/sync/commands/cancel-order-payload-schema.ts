import { z } from "zod";
import { uuidSchema } from "../../primitives/uuid-schema";
import { reasonCodeSchema, reasonNoteSchema } from "./command-payload-parts";

/** order.cancel: drops a draft nobody will pay for. */
export const cancelOrderPayloadSchema = z.object({
  orderId: uuidSchema,
  reasonCode: reasonCodeSchema,
  /** What happened, in the staff member's words; needed when the reason is "other". */
  reasonNote: reasonNoteSchema.optional(),
  /**
   * A manager's approval, when the draft's pre-bill was printed or the kitchen was sent
   * part of it and the staff member may not close an unpaid order alone.
   */
  approvalId: uuidSchema.optional(),
});

export type CancelOrderPayload = z.infer<typeof cancelOrderPayloadSchema>;
