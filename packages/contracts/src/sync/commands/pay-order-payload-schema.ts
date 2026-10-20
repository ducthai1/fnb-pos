import { z } from "zod";
import { QR_TRANSFER_METHOD } from "../../payment/payment-intent-payload-schemas";
import { wholeDongSchema } from "../../primitives/money-schema";
import { uuidSchema } from "../../primitives/uuid-schema";
import { paymentMethodSchema, tenderedAmountSchema } from "./command-payload-parts";

const tenderSchema = z
  .object({
    method: paymentMethodSchema,
    amount: tenderedAmountSchema,
    /** The QR the money came in through; the server pays with it only once it is paid. */
    paymentIntentId: uuidSchema.optional(),
  })
  // A QR transfer is money the bank confirmed for one intent; any other method has none.
  .refine(
    (tender) => (tender.method === QR_TRANSFER_METHOD) === (tender.paymentIntentId !== undefined),
    {
      message: "qr_transfer goes with a paymentIntentId, and only it",
      path: ["paymentIntentId"],
    },
  );

/** order.pay: closes a draft with the payments the till took. */
export const payOrderPayloadSchema = z.object({
  orderId: uuidSchema,
  payments: z
    .array(tenderSchema)
    .min(1)
    .max(10)
    .refine(
      (tenders) => {
        const intents = tenders.flatMap((tender) => tender.paymentIntentId ?? []);
        return new Set(intents).size === intents.length;
      },
      { message: "one intent pays once" },
    ),
  /** What the till asked the customer for; the server compares it with its own total. */
  expectedAmountDue: wholeDongSchema,
  /** The shift the till was in when it took the money; a late payment keeps that shift. */
  shiftId: uuidSchema.optional(),
});

export type PayOrderPayload = z.infer<typeof payOrderPayloadSchema>;
