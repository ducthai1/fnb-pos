import type { PosAvailability } from "@fnb/contracts";

/**
 * Sold out ("86") on this channel at `now` (the till's clock, epoch ms): an entry for every
 * channel or for this one, with no end or an end still ahead. Mirrors the server's check on
 * a draft, so the till never offers what the server will refuse.
 */
export function isSoldOut(
  availability: PosAvailability | undefined,
  channelKey: string | null,
  now: number,
): boolean {
  if (availability === undefined) return false;
  return availability.entries.some(
    (entry) =>
      (entry.channelKey === null || (channelKey !== null && entry.channelKey === channelKey)) &&
      (entry.unavailableUntil === null || entry.unavailableUntil > now),
  );
}
