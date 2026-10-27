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

/** The reason the drawer's cash move gives when it hands an over transfer's excess back. */
export const QR_EXCESS_HANDED_BACK_REASON = "Trả lại tiền chuyển thừa";

/**
 * payment.hand_back_excess: the customer transferred more than the order, which was closed
 * with the QR at its own amount; the cashier hands `amount` (the excess, as the till read it;
 * the server checks it against the bank's) back in cash from the drawer of the till's shift.
 */
export const handBackQrExcessPayloadSchema = z.object({
  intentId: uuidSchema,
  cashMoveId: uuidSchema,
  amount: wholeDongSchema.positive(),
  /** A manager's approval, for a cash move past what the staff member may move alone. */
  approvalId: uuidSchema.optional(),
});

export type HandBackQrExcessPayload = z.infer<typeof handBackQrExcessPayloadSchema>;
export type CreatePaymentIntentPayload = z.infer<typeof createPaymentIntentPayloadSchema>;
export type CancelPaymentIntentPayload = z.infer<typeof cancelPaymentIntentPayloadSchema>;
