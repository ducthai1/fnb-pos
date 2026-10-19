import { z } from "zod";
import { uuidSchema } from "../../primitives/uuid-schema";

/** order.remove_discount: takes discount lines off a draft. */
export const removeDiscountPayloadSchema = z.object({
  orderId: uuidSchema,
  discountLineIds: z.array(uuidSchema).min(1).max(50),
});

export type RemoveDiscountPayload = z.infer<typeof removeDiscountPayloadSchema>;
