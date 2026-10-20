import type { PaymentIntentSnapshot } from "@fnb/contracts";
import { type Vnd, subtractVnd, vnd } from "@fnb/domain";

/** What the QR on screen has come to, as the cashier needs to act on it. */
export type QrPhase =
  /** Nothing recorded yet. */
  | { readonly kind: "drawing" }
  | { readonly kind: "waiting"; readonly secondsLeft: number }
  /** The bank brought exactly the amount: the order closes with it. */
  | { readonly kind: "paid" }
  /** The bank brought less, or more: a person settles it, the till never guesses. */
  | { readonly kind: "short"; readonly gap: Vnd }
  | { readonly kind: "over"; readonly gap: Vnd }
  /** Its time ran out; `lateTransfer` when money arrived after that, waiting for a person. */
  | { readonly kind: "expired"; readonly lateTransfer: boolean }
  /** Taken down on the server: the order was paid another way, or changed. */
  | { readonly kind: "withdrawn" }
  /** The server refused to register the QR, with this code. */
  | { readonly kind: "refused"; readonly code: string };

/** The QR as the till holds it: its row (optimistic until answered), and any refusal. */
export interface QrIntentState {
  readonly intent: PaymentIntentSnapshot | null;
  readonly refusal: string | null;
}

/**
 * The phase at `now`. A QR still pending past its expiry has expired: the server leaves it
 * pending until something happens to it, and only a transfer before the expiry pays it.
 */
export function qrPhaseOf(state: QrIntentState, now: number): QrPhase {
  if (state.refusal !== null) return { kind: "refused", code: state.refusal };
  const { intent } = state;
  if (intent === null) return { kind: "drawing" };
  const asked = vnd(intent.amount);
  const received = vnd(intent.receivedAmount ?? 0);
  switch (intent.status) {
    case "paid":
      return { kind: "paid" };
    case "partial":
      return { kind: "short", gap: subtractVnd(asked, received) };
    case "overpaid":
      return { kind: "over", gap: subtractVnd(received, asked) };
    case "expired":
      return { kind: "expired", lateTransfer: true };
    case "cancelled":
      return { kind: "withdrawn" };
    case "pending": {
      const left = Date.parse(intent.expiresAt) - now;
      return left > 0
        ? { kind: "waiting", secondsLeft: Math.ceil(left / 1000) }
        : { kind: "expired", lateTransfer: false };
    }
  }
}

/** "14:05" for the countdown under the QR. */
export function countdownText(secondsLeft: number): string {
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
