import { DomainError } from "../errors";
import { type Vnd, ZERO_VND, addVnd, compareVnd, subtractVnd } from "../money";
import { PAYMENT_ERROR_CODES } from "./payment-error-codes";
import type { TransferSettlement } from "./payment-intent-status";

/**
 * What a QR the bank settled puts toward its order: all it brought when it came short (the
 * rest is collected another way), what it asked for when it came exactly or over (the
 * excess is the customer's, handed back apart from the sale).
 */
export function qrTenderAmount(settlement: TransferSettlement, asked: Vnd, received: Vnd): Vnd {
  return settlement === "partial" ? received : asked;
}

/** What an over transfer brought beyond the QR's amount: the customer's, never takings. */
export function qrExcess(asked: Vnd, received: Vnd): Vnd {
  if (compareVnd(received, asked) <= 0) {
    throw new DomainError(PAYMENT_ERROR_CODES.invalidAmount, "only an over transfer has excess", {
      asked: String(asked),
      received: String(received),
    });
  }
  return subtractVnd(received, asked);
}

/**
 * What the customer is owed back of what the bank brought for a QR: the excess of an over
 * transfer the sale was closed with (the sale counts what the QR asked), or all of it when
 * no sale counts any of it.
 */
export function qrMoneyOwedBack(
  settlement: TransferSettlement,
  asked: Vnd,
  received: Vnd,
  usedBySale: boolean,
): Vnd {
  if (!usedBySale) return received;
  return settlement === "overpaid" ? qrExcess(asked, received) : ZERO_VND;
}

/**
 * What a further tender (cash, or a second QR) must bring once short transfers paid part of
 * `amountDue`: exactly the rest, never less (the order would close unpaid) nor more (the
 * bank's money would exceed the sale). Short transfers that already cover it are refused.
 */
export function remainderAfterShortTransfers(amountDue: Vnd, received: readonly Vnd[]): Vnd {
  const brought = addVnd(ZERO_VND, ...received);
  if (compareVnd(brought, amountDue) >= 0) {
    throw new DomainError(PAYMENT_ERROR_CODES.invalidAmount, "short transfers cover the order", {
      amountDue: String(amountDue),
      brought: String(brought),
    });
  }
  return subtractVnd(amountDue, brought);
}
