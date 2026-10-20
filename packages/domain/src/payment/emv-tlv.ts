import { DomainError } from "../errors";
import { PAYMENT_ERROR_CODES } from "./payment-error-codes";

/**
 * EMVCo QR fields are tag-length-value: a two-digit tag, a two-digit length and the value.
 * Values here are ASCII, so the length in characters is the length in bytes too.
 */
export function encodeTlv(tag: string, value: string): string {
  if (!/^\d{2}$/.test(tag) || value.length === 0 || value.length > 99) {
    throw new DomainError(PAYMENT_ERROR_CODES.malformedPayload, `field ${tag} cannot be encoded`);
  }
  return `${tag}${value.length.toString().padStart(2, "0")}${value}`;
}

/**
 * The fields of one level of a payload, in order. A field cut short, a length that is not
 * two digits, or a tag given twice makes the payload unreadable rather than half-read: a
 * QR guessed at could send money to the wrong account.
 */
export function decodeTlv(text: string): ReadonlyMap<string, string> {
  const fields = new Map<string, string>();
  let at = 0;
  while (at < text.length) {
    const tag = text.slice(at, at + 2);
    const lengthText = text.slice(at + 2, at + 4);
    if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(lengthText)) throw malformed(at);
    const length = Number(lengthText);
    const value = text.slice(at + 4, at + 4 + length);
    if (length === 0 || value.length !== length || fields.has(tag)) throw malformed(at);
    fields.set(tag, value);
    at += 4 + length;
  }
  return fields;
}

function malformed(at: number): DomainError {
  return new DomainError(PAYMENT_ERROR_CODES.malformedPayload, `unreadable field at ${at}`, {
    at,
  });
}
