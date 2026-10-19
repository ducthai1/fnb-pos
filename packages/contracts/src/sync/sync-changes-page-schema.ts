import { z } from "zod";
import { uuidSchema } from "../primitives/uuid-schema";
import { entitySnapshotSchema } from "./entity-snapshot-schema";

const INT8_MAX = 2n ** 63n - 1n;
const POSITIVE_DECIMAL = /^[1-9]\d{0,18}$/;

/*
 * Zod still runs a refinement when an earlier check failed, so anything handing text to
 * BigInt first makes sure it is digits; a malformed value is reported by the regex alone.
 */
const seqOf = (text: string): bigint | null => (POSITIVE_DECIMAL.test(text) ? BigInt(text) : null);

/**
 * The server's change counter, a Postgres bigint, as a decimal string: it outgrows a JSON
 * number's exact range long before it outgrows bigint.
 */
export const changeSeqSchema = z
  .string()
  .regex(POSITIVE_DECIMAL, { message: "not a change sequence number" })
  .refine((text) => (seqOf(text) ?? 0n) <= INT8_MAX, { message: "change sequence beyond bigint" });

export const syncChangeSchema = z
  .object({
    changeSeq: changeSeqSchema,
    /** The table the row lives in, e.g. "product". */
    entity: z
      .string()
      .max(64)
      .regex(/^[a-z][a-z0-9_]*$/, { message: "not an entity name" }),
    entityId: uuidSchema,
    /** The row after the change; null when the change deleted it. */
    snapshot: entitySnapshotSchema.nullable(),
  })
  .strict();

function isStrictlyIncreasing(changes: readonly { changeSeq: string }[]): boolean {
  let previous = 0n;
  for (const change of changes) {
    const seq = seqOf(change.changeSeq);
    if (seq === null) continue;
    if (seq <= previous) return false;
    previous = seq;
  }
  return true;
}

/**
 * One page of what changed since a till's cursor. A till applies changes in order and then
 * stores nextCursor, so a page out of order would make it keep an older row over a newer
 * one; that is refused here rather than trusted. The cursor is opaque to the till: it is
 * sent back as is to ask for the next page.
 */
export const syncChangesPageSchema = z
  .object({
    changes: z
      .array(syncChangeSchema)
      .refine(isStrictlyIncreasing, { message: "changes are not in changeSeq order" }),
    nextCursor: z.string().min(1).max(128),
  })
  .strict();

export type SyncChange = z.infer<typeof syncChangeSchema>;
export type SyncChangesPage = z.infer<typeof syncChangesPageSchema>;
