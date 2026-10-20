import { DomainError } from "../errors";
import { type Vnd, compareVnd } from "../money";
import { PAYMENT_ERROR_CODES } from "./payment-error-codes";

/**
 * pending: the QR is out and nothing has arrived; paid / partial / overpaid: a transfer
 * was matched and came to exactly, less than, or more than was asked; expired: the QR's
 * time ran out before a transfer arrived; cancelled: the till withdrew the QR (another
 * method was used, the order changed). Only an exact payment closes an order by itself;
 * less or more is for a person to settle, never for the system to guess at.
 */
export type PaymentIntentStatus =
  "pending" | "paid" | "partial" | "overpaid" | "expired" | "cancelled";

export type TransferSettlement = "paid" | "partial" | "overpaid";

export const PAYMENT_INTENT_STATUSES: readonly PaymentIntentStatus[] = [
  "pending",
  "paid",
  "partial",
  "overpaid",
  "expired",
  "cancelled",
];

/**
 * A matched transfer is final, so a settled intent never takes a second one: a customer
 * who pays twice leaves the second transfer for a person to match or refund. An expired
 * intent can still be settled by hand, when a staff member sees the late transfer is it.
 */
const ALLOWED_TRANSITIONS: Readonly<Record<PaymentIntentStatus, readonly PaymentIntentStatus[]>> = {
  pending: ["paid", "partial", "overpaid", "expired", "cancelled"],
  expired: ["paid", "partial", "overpaid"],
  paid: [],
  partial: [],
  overpaid: [],
  cancelled: [],
};

export function transitionPaymentIntent(
  from: PaymentIntentStatus,
  to: PaymentIntentStatus,
): PaymentIntentStatus {
  if (ALLOWED_TRANSITIONS[from].includes(to)) return to;
  throw new DomainError(
    PAYMENT_ERROR_CODES.invalidIntentTransition,
    `a payment intent cannot move from ${from} to ${to}`,
    { from, to },
  );
}

/** What a transfer of `received` does to an intent asking for `asked`. */
export function settlementOfTransfer(asked: Vnd, received: Vnd): TransferSettlement {
  if (asked <= 0n || received <= 0n) {
    throw new DomainError(PAYMENT_ERROR_CODES.invalidAmount, "transfers are positive amounts");
  }
  const order = compareVnd(received, asked);
  return order === 0 ? "paid" : order < 0 ? "partial" : "overpaid";
}

/** The status an intent moves to when `received` is matched to it. */
export function settlePaymentIntent(
  status: PaymentIntentStatus,
  asked: Vnd,
  received: Vnd,
): TransferSettlement {
  const settlement = settlementOfTransfer(asked, received);
  transitionPaymentIntent(status, settlement);
  return settlement;
}
