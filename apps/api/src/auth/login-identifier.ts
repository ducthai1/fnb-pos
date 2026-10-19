/** How an account is named at sign-in; exactly one of the two is set. */
export type LoginIdentifier = { email: string; phone: null } | { email: null; phone: string };

const EMAIL = /^[^\s@]+@[^\s@]+$/;
const SEPARATORS = /[\s.\-()]/g;
// Mobile prefixes 03, 05, 07, 08, 09 only: sign-in codes go by SMS, which landlines cannot get.
const SUBSCRIBER = /^[35789]\d{8}$/;

/** Trimmed and lowercased, as stored; null when it cannot be an address at all. */
export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  return EMAIL.test(email) ? email : null;
}

/**
 * A Vietnamese number in E.164 (`+84` and nine digits), as stored. Accepts what people
 * actually type: `0912 345 678`, `0912.345.678`, `+84 912 345 678`, `84912345678`,
 * `0084912345678`. Null for anything else: landlines, and numbers of other countries,
 * which the shops do not sign in with today.
 */
export function normalizeVietnamPhone(raw: string): string | null {
  const digits = raw.trim().replace(SEPARATORS, "");
  let subscriber: string | null = null;
  if (digits.startsWith("+84")) subscriber = digits.slice(3);
  else if (digits.startsWith("0084")) subscriber = digits.slice(4);
  else if (digits.startsWith("84") && digits.length === 11) subscriber = digits.slice(2);
  else if (digits.startsWith("0") && digits.length === 10) subscriber = digits.slice(1);
  return subscriber !== null && SUBSCRIBER.test(subscriber) ? `+84${subscriber}` : null;
}

/** The identifier of a login request, or null when the given one cannot be normalized. */
export function loginIdentifier(input: { email?: string; phone?: string }): LoginIdentifier | null {
  if (input.email !== undefined) {
    const email = normalizeEmail(input.email);
    return email === null ? null : { email, phone: null };
  }
  if (input.phone !== undefined) {
    const phone = normalizeVietnamPhone(input.phone);
    return phone === null ? null : { email: null, phone };
  }
  return null;
}
