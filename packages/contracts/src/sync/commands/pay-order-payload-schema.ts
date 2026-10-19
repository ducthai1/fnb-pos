import { z } from "zod";
import { wholeDongSchema } from "../../primitives/money-schema";
import { uuidSchema } from "../../primitives/uuid-schema";
import { paymentMethodSchema, tenderedAmountSchema } from "./command-payload-parts";

/** order.pay: closes a draft with the payments the till took. */
export const payOrderPayloadSchema = z.object({
  orderId: uuidSchema,
  payments: z
    .array(z.object({ method: paymentMethodSchema, amount: tenderedAmountSchema }))
    .min(1)
    .max(10),
  /** What the till asked the customer for; the server compares it with its own total. */
  expectedAmountDue: wholeDongSchema,
  /** The shift the till was in when it took the money; a late payment keeps that shift. */
  shiftId: uuidSchema.optional(),
});

export type PayOrderPayload = z.infer<typeof payOrderPayloadSchema>;
