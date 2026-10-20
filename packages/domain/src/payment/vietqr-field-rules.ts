import { DomainError } from "../errors";
import type { Vnd } from "../money";
import { PAYMENT_ERROR_CODES } from "./payment-error-codes";

/**
 * EMVCo caps the purpose-of-transaction and merchant-name fields at 25 characters. Bank
 * apps differ in what they do with longer text (cut it, refuse the QR), and a cut content
 * can lose the code a transfer is matched by, so longer text is refused here instead.
 */
export const TRANSFER_CONTENT_MAX_LENGTH = 25;

/**
 * Letters, digits and single inner spaces. Banks strip or mangle accents, punctuation and
 * line breaks differently from one app to the next, so anything else could arrive in the
 * bank's notice as something other than what the QR asked for.
 */
const SAFE_TEXT = /^[A-Za-z0-9]+(?: [A-Za-z0-9]+)*$/;

/** The amount field holds at most 13 characters; đồng have no decimals to write. */
const MAX_AMOUNT = 9_999_999_999_999n;

export function assertBankBin(bankBin: string): void {
  if (!/^\d{6}$/.test(bankBin)) {
    throw new DomainError(PAYMENT_ERROR_CODES.invalidBankBin, "a bank BIN is six digits");
  }
}

/** Account numbers are digits; some banks' virtual accounts carry letters too. */
export function assertAccountNumber(accountNumber: string): void {
  if (!/^[0-9A-Za-z]{1,19}$/.test(accountNumber)) {
    throw new DomainError(
      PAYMENT_ERROR_CODES.invalidAccountNumber,
      "an account number is 1 to 19 letters or digits",
    );
  }
}

export function assertQrAmount(amount: Vnd): void {
  if (amount <= 0n || amount > MAX_AMOUNT) {
    throw new DomainError(PAYMENT_ERROR_CODES.invalidAmount, `cannot ask for ${amount} đồng`, {
      amount: amount.toString(),
    });
  }
}

export function assertTransferContent(content: string): void {
  assertSafeText(content, PAYMENT_ERROR_CODES.contentInvalidCharacters);
  if (content.length > TRANSFER_CONTENT_MAX_LENGTH) {
    throw new DomainError(
      PAYMENT_ERROR_CODES.contentTooLong,
      `transfer content is ${content.length} characters, at most ${TRANSFER_CONTENT_MAX_LENGTH}`,
    );
  }
}

export function assertMerchantName(name: string): void {
  assertSafeText(name, PAYMENT_ERROR_CODES.invalidMerchantName);
  if (name.length > TRANSFER_CONTENT_MAX_LENGTH) {
    throw new DomainError(PAYMENT_ERROR_CODES.invalidMerchantName, "merchant name too long");
  }
}

function assertSafeText(text: string, code: string): void {
  if (!SAFE_TEXT.test(text)) {
    throw new DomainError(code, "only letters, digits and single inner spaces are allowed");
  }
}
