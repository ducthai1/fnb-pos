import { type Vnd, vnd } from "@fnb/domain";
import { z } from "zod";

/**
 * Whole đồng as a JSON number. VND amounts stay far below 2^53, so a number carries them
 * exactly and stays readable in a request log; anything outside the safe integer range is
 * refused at the edge rather than silently rounded by JSON.parse.
 */
export const wholeDongSchema = z.number().int().safe();

/** An amount on the wire, as the domain's Vnd. Sign is left to the rule using it (refunds are negative). */
export const moneySchema = wholeDongSchema.transform((value) => vnd(value));

/**
 * The JSON number for an amount. A Vnd beyond the safe range would come out rounded, so it
 * throws instead: such an amount is a bug or corrupt data, never something to send.
 */
export function moneyToWire(amount: Vnd): number {
  const wire = Number(amount);
  if (!Number.isSafeInteger(wire)) {
    throw new RangeError(`amount is outside the exact JSON number range: ${amount}`);
  }
  return wire;
}
