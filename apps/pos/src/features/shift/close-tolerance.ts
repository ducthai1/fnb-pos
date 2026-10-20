import { type Vnd, ZERO_VND, vnd } from "@fnb/domain";

/** The setting the server reads its close tolerance from, in whole đồng as a decimal string. */
export const CLOSE_TOLERANCE_SETTING = "shift_close_difference_tolerance";

/**
 * How far either way a counted drawer may be off before a manager must accept it, as the
 * till's settings carry it; nothing (the server's default too) means every difference.
 */
export function closeToleranceOf(settings: Readonly<Record<string, unknown>>): Vnd {
  const value = settings[CLOSE_TOLERANCE_SETTING];
  return typeof value === "string" && /^(0|[1-9]\d{0,14})$/.test(value)
    ? vnd(BigInt(value))
    : ZERO_VND;
}
