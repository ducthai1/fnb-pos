import { z } from "zod";
import { SYNC_FEATURE_SHIFT_VERSION, instantSchema, uuidSchema as idSchema } from "@fnb/contracts";
import type { SyncCommandEnvelope, SyncCommandResult } from "./sync-wire-types";

/** A real calendar day: "2026-02-30" would pass a pattern and then fail in Postgres. */
const businessDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((day) => new Date(`${day}T00:00:00Z`).toISOString().startsWith(day));

// Envelopes are not strict: a newer till may send fields this server does not know yet,
// and refusing the whole batch for that would stall its sync. The payload is checked per
// command type later (the contracts of packages/contracts/src/sync/commands), so a bad
// payload becomes a stored rejection of that one command.
const envelopeSchema = z.object({
  commandId: idSchema,
  deviceSeq: z.number().int().positive().safe(),
  type: z.string().min(1).max(64),
  payload: z.unknown(),
  staffSessionId: idSchema.optional(),
  approvalId: idSchema.optional(),
  businessDate: businessDateSchema,
  domainVersion: z.string().max(32),
  createdAt: instantSchema,
  resentFromGeneration: idSchema.optional(),
});

export const syncCommandBatchSchema = z.object({
  commands: z.array(envelopeSchema).min(1).max(100),
});

/** A revoked till's batch under a manager's flush grant; `final` on its last one. */
export const flushBatchSchema = syncCommandBatchSchema.extend({
  code: z.string().max(32),
  final: z.boolean().optional(),
});

/**
 * The answers as a till asked for them (SYNC_FEATURES_HEADER, comma separated): a till of an
 * older release parses each answer strictly, so it only gets the fields it named.
 */
export function resultsForFeatures(
  answered: readonly SyncCommandResult[],
  featuresHeader: string,
): SyncCommandResult[] {
  const features = featuresHeader.split(",").map((name) => name.trim());
  if (features.includes(SYNC_FEATURE_SHIFT_VERSION)) return [...answered];
  return answered.map((result) => {
    const { shiftVersion, ...plain } = result;
    return shiftVersion === undefined ? result : plain;
  });
}

export const syncChangesQuerySchema = z.object({
  // A bigint cursor as decimal text, compared by Postgres as a number.
  cursor: z
    .string()
    .regex(/^(0|[1-9]\d{0,17})$/)
    .default("0"),
  limit: z.coerce.number().int().min(1).max(1_000).default(500),
});

/** The batch's commands as the protocol types them, optional fields left out when absent. */
export function envelopesOf(
  batch: Pick<z.infer<typeof syncCommandBatchSchema>, "commands">,
): SyncCommandEnvelope[] {
  return batch.commands.map(
    ({ staffSessionId, approvalId, resentFromGeneration, payload, ...required }) => ({
      ...required,
      payload,
      ...(staffSessionId === undefined ? {} : { staffSessionId }),
      ...(approvalId === undefined ? {} : { approvalId }),
      ...(resentFromGeneration === undefined ? {} : { resentFromGeneration }),
    }),
  );
}
