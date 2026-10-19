import { z } from "zod";
import { uuidSchema } from "../../primitives/uuid-schema";
import { reasonCodeSchema } from "./command-payload-parts";

/** order.cancel: drops a draft nobody will pay for. */
export const cancelOrderPayloadSchema = z.object({
  orderId: uuidSchema,
  reasonCode: reasonCodeSchema,
});

export type CancelOrderPayload = z.infer<typeof cancelOrderPayloadSchema>;
