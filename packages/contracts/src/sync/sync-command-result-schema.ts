import { z } from "zod";
import { uuidSchema } from "../primitives/uuid-schema";
import { entitySnapshotSchema, errorCodeSchema } from "./entity-snapshot-schema";

/** Request header of a till naming the answers it understands, comma separated. */
export const SYNC_FEATURES_HEADER = "x-fnb-sync-features";
/** The feature name of `shiftVersion` in an accepted answer. */
export const SYNC_FEATURE_SHIFT_VERSION = "shift-version";

/**
 * The server's answer to one command, kept and answered again for a repeated commandId.
 * - accepted: applied; the snapshot, when there is one, is the row it produced.
 * - rejected: final; it needs a code to tell the cashier why, and may carry the row as the
 *   server has it so the till can put its copy right.
 * - retry: not applied yet, nothing kept, and safe to send again under the same id: an
 *   earlier deviceSeq has not arrived, or the command is dated ahead of the server's clock
 *   (the till dates it again by the server time the answer's header carries).
 */
export const syncCommandResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      commandId: uuidSchema,
      status: z.literal("accepted"),
      snapshot: entitySnapshotSchema.optional(),
      /**
       * The version of the shift's copy once this payment, refund or cash move is in the
       * shift's cash book: a till counts the money in its expected cash until its copy of
       * the shift reaches it. Sent only to a till that asks for it (see
       * SYNC_FEATURES_HEADER): an older till parses an answer strictly.
       */
      shiftVersion: z.number().int().nonnegative().optional(),
    })
    .strict(),
  z
    .object({
      commandId: uuidSchema,
      status: z.literal("rejected"),
      code: errorCodeSchema,
      snapshot: entitySnapshotSchema.optional(),
    })
    .strict(),
  z
    .object({
      commandId: uuidSchema,
      status: z.literal("retry"),
      code: errorCodeSchema.optional(),
    })
    .strict(),
]);

export type SyncCommandResult = z.infer<typeof syncCommandResultSchema>;
export type SyncCommandStatus = SyncCommandResult["status"];
