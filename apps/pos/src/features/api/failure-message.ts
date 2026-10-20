import { messageForCode, vi } from "../../messages/vi";
import type { ApiFailure } from "./api-result";

const PIN_LOCKED = "API_STAFF_PIN_LOCKED";
const RATE_LIMITED = "API_RATE_LIMITED";

const clockTime = (iso: string): string | null => {
  const time = new Date(iso);
  return Number.isNaN(time.getTime())
    ? null
    : time.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
};

/** The sentence a screen shows for a failed call. */
export function failureMessage(failure: ApiFailure): string {
  if (failure.status === null) return vi.errors.network;
  if (failure.code === PIN_LOCKED) {
    const until = (failure.body as { lockedUntil?: unknown } | null)?.lockedUntil;
    const time = typeof until === "string" ? clockTime(until) : null;
    if (time !== null) return vi.errors.pinLockedUntil(time);
  }
  if (failure.code === RATE_LIMITED && failure.retryAfterSeconds !== undefined) {
    return vi.errors.rateLimitedFor(failure.retryAfterSeconds);
  }
  return messageForCode(failure.code);
}
