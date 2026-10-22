/**
 * When the server asks a wallet again about a payment still pending: soon after it opened
 * (a customer who scans at once is paid within seconds), then backing off to once a
 * minute, so fifteen minutes of a QR cost about twenty questions, not hundreds.
 */
export const FIRST_QUERY_AFTER_MS = 5_000;
const LONGEST_WAIT_MS = 60_000;

/** The wait before the next question, after `attempts` questions already asked. */
export function nextQueryDelayMs(attempts: number): number {
  return Math.min(FIRST_QUERY_AFTER_MS * 2 ** Math.min(attempts, 10), LONGEST_WAIT_MS);
}

/**
 * How long past its expiry a payment the wallet still calls processing is asked about. A
 * wallet stops taking money at the expiry the server gave it, so by then the answer is
 * final; this only bounds a wallet that never says so. After it the intent expires.
 */
export const GIVE_UP_AFTER_EXPIRY_MS = 60 * 60_000;
