import { type Vnd, ZERO_VND, addVnd, compareVnd, subtractVnd } from "@fnb/domain";

/** Payment method keys as the shop's payment table stores them. */
export const PAYMENT_METHODS = { cash: "cash", qrTransfer: "qr_transfer" } as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[keyof typeof PAYMENT_METHODS];

/** What the customer handed over or transferred, in the order it was taken. */
export interface Tender {
  readonly method: PaymentMethod;
  readonly amount: Vnd;
  /**
   * The QR whose transfer the bank confirmed: a transfer is only ever money the server
   * matched to a QR the till showed, never a cashier's word that it arrived.
   */
  readonly paymentIntentId?: string;
}

/** The part of a tender that pays the order; the rest of a cash tender is change. */
export interface AppliedPayment {
  readonly method: PaymentMethod;
  readonly amount: Vnd;
  readonly paymentIntentId?: string;
}

export interface Settlement {
  readonly payments: readonly AppliedPayment[];
  /** Still owed; zero once the order is covered. */
  readonly remaining: Vnd;
  /** Cash to hand back. */
  readonly change: Vnd;
}

export type TenderRefusal =
  "not_positive" | "nothing_left" | "transfer_over_remaining" | "transfer_without_qr" | "too_many";

/** order.pay carries at most this many payments. */
export const MAX_TENDERS = 10;

/**
 * Each tender pays what is still owed, up to its amount; what cash exceeds it by is change.
 * The server wants the payments to add up to its total to the đồng, so the change never
 * travels as a payment.
 */
export function settleTenders(amountDue: Vnd, tenders: readonly Tender[]): Settlement {
  let remaining = amountDue;
  let change = ZERO_VND;
  const payments: AppliedPayment[] = [];
  for (const tender of tenders) {
    const applied = compareVnd(tender.amount, remaining) > 0 ? remaining : tender.amount;
    const intent = tender.paymentIntentId;
    payments.push({
      method: tender.method,
      amount: applied,
      ...(intent === undefined ? {} : { paymentIntentId: intent }),
    });
    change = addVnd(change, subtractVnd(tender.amount, applied));
    remaining = subtractVnd(remaining, applied);
  }
  return { payments, remaining, change };
}

/**
 * Why a tender cannot be taken, or null. Only cash gives change: a transfer for more than
 * is owed would leave the shop owing the customer money it cannot hand back from a bank.
 * A transfer names the QR the bank paid; without one the server refuses the whole payment.
 */
export function refuseTender(
  amountDue: Vnd,
  tenders: readonly Tender[],
  next: Tender,
): TenderRefusal | null {
  if (tenders.length >= MAX_TENDERS) return "too_many";
  if (next.method === PAYMENT_METHODS.qrTransfer && next.paymentIntentId === undefined) {
    return "transfer_without_qr";
  }
  if (compareVnd(next.amount, ZERO_VND) <= 0) return "not_positive";
  const { remaining } = settleTenders(amountDue, tenders);
  if (compareVnd(remaining, ZERO_VND) === 0) return "nothing_left";
  if (next.method !== PAYMENT_METHODS.cash && compareVnd(next.amount, remaining) > 0) {
    return "transfer_over_remaining";
  }
  return null;
}

/**
 * The payments order.pay sends once nothing is owed, or null while something is: every
 * tender that paid a part, or a single zero cash payment for an order that costs nothing.
 */
export function paymentsToSend(amountDue: Vnd, settlement: Settlement): AppliedPayment[] | null {
  if (compareVnd(settlement.remaining, ZERO_VND) !== 0) return null;
  const paying = settlement.payments.filter((payment) => compareVnd(payment.amount, ZERO_VND) > 0);
  if (compareVnd(amountDue, ZERO_VND) === 0)
    return [{ method: PAYMENT_METHODS.cash, amount: ZERO_VND }];
  return paying;
}
