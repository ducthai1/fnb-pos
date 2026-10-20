import { DomainError } from "../errors";
import { PAYMENT_ERROR_CODES } from "./payment-error-codes";

export const CONTENT_CODE_PREFIX = "FNB";
const RANDOM_LENGTH = 8;
export const CONTENT_CODE_LENGTH = CONTENT_CODE_PREFIX.length + RANDOM_LENGTH;

/**
 * Crockford's base32: digits and capitals without I, L, O and U, so a code read aloud or
 * typed by hand from the screen has no look-alike characters. 32 symbols over 8 places
 * give 2^40 codes, enough that two live codes of one shop practically never collide.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_PATTERN = new RegExp(`^${CONTENT_CODE_PREFIX}[${ALPHABET}]{${RANDOM_LENGTH}}$`);

/**
 * A transfer code from random bytes the caller drew (the domain draws no randomness). Each
 * byte gives one symbol from its low five bits, which keeps every symbol equally likely.
 */
export function contentCodeFromRandom(random: Uint8Array): string {
  if (random.length < RANDOM_LENGTH) {
    throw new DomainError(PAYMENT_ERROR_CODES.notEnoughRandomness, "need 8 random bytes");
  }
  let code = CONTENT_CODE_PREFIX;
  for (let index = 0; index < RANDOM_LENGTH; index += 1) {
    code += ALPHABET.charAt((random[index] ?? 0) & 0x1f);
  }
  return code;
}

export function isContentCode(text: string): boolean {
  return CODE_PATTERN.test(text);
}

/**
 * Every transfer code the bank's description of a transfer mentions, once each, in order.
 * Banks upper-case, insert spaces or dots, prefix their own references and break long
 * text, so the description is read with everything but letters and digits removed; the
 * letters people misread for digits are read as those digits, as Crockford's base32 says.
 */
export function contentCodesIn(description: string): string[] {
  const text = description
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  const found: string[] = [];
  for (let at = text.indexOf(CONTENT_CODE_PREFIX); at !== -1;) {
    const candidate = text.slice(at, at + CONTENT_CODE_LENGTH);
    if (isContentCode(candidate) && !found.includes(candidate)) found.push(candidate);
    at = text.indexOf(CONTENT_CODE_PREFIX, at + 1);
  }
  return found;
}
