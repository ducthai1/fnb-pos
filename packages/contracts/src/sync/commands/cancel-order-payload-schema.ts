import { z } from "zod";
import { uuidSchema } from "../../primitives/uuid-schema";
import { reasonCodeSchema } from "./command-payload-parts";

/** order.cancel: drops a draft nobody will pay for. */
export const cancelOrderPayloadSchema = z.object({
  orderId: uuidSchema,
  reasonCode: reasonCodeSchema,
  /**
   * A manager's approval, when the draft's pre-bill was printed or the kitchen was sent
   * part of it and the staff member may not close an unpaid order alone.
   */
  approvalId: uuidSchema.optional(),
});

export type CancelOrderPayload = z.infer<typeof cancelOrderPayloadSchema>;
