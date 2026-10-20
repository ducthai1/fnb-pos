import { isContentCode } from "@fnb/domain/payment";
import { z } from "zod";
import { wholeDongSchema } from "../primitives/money-schema";
import { uuidSchema } from "../primitives/uuid-schema";

/** The payment method of money that came in by a VietQR the till showed. */
export const QR_TRANSFER_METHOD = "qr_transfer";

/** The code a transfer is matched by: FNB and eight Crockford base32 symbols. */
export const contentCodeSchema = z.string().refine(isContentCode, { message: "not a code" });

/**
 * payment.create_intent: the till showed a VietQR asking for the order's amount due, with
 * `contentCode` as the transfer content. The till draws the id and the code itself, so the
 * QR goes up even offline; the server checks the amount against its own total.
 */
export const createPaymentIntentPayloadSchema = z.object({
  intentId: uuidSchema,
  orderId: uuidSchema,
  amount: wholeDongSchema.positive(),
  contentCode: contentCodeSchema,
});

/** payment.cancel_intent: the till took the QR down before any transfer was matched to it. */
export const cancelPaymentIntentPayloadSchema = z.object({ intentId: uuidSchema });

export type CreatePaymentIntentPayload = z.infer<typeof createPaymentIntentPayloadSchema>;
export type CancelPaymentIntentPayload = z.infer<typeof cancelPaymentIntentPayloadSchema>;
