import type { CounterOrder } from "./counter-order";

// Quantities and prices are bigints, which JSON cannot write: they are compared as text.
const plain = (_key: string, value: unknown) => (typeof value === "bigint" ? `${value}n` : value);

/**
 * Whether a cart change left the order as it was (the same note typed again, an option
 * chosen again): such a change saves nothing. The server keeps an unchanged draft at its
 * version, so a save sent for it would leave the till counting one version too many and its
 * next save refused as stale. A difference only in the order the keys were written counts
 * as a change, which is the safe side: the save goes out.
 */
export function sameCart(before: CounterOrder, after: CounterOrder): boolean {
  return JSON.stringify(before, plain) === JSON.stringify(after, plain);
}
