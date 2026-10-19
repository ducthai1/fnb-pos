import { v7 } from "uuid";

/**
 * A new record id: UUIDv7 (RFC 9562). The first 48 bits are the creation millisecond, so
 * ids created on an offline POS still sort by creation time and keep btree inserts local.
 * Within one process the generator stays strictly increasing, even when several ids share
 * a millisecond or the device clock steps backwards.
 */
export function newId(): string {
  return v7();
}

/** The creation millisecond embedded in a UUIDv7. */
export function idTimestampMillis(id: string): number {
  return Number.parseInt(id.replaceAll("-", "").slice(0, 12), 16);
}
