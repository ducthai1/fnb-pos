import { entitySnapshotSchema, syncChangeSchema, syncCommandEnvelopeSchema } from "@fnb/contracts";
import { SYNC_CLIENT_ERROR_CODES, SyncClientError } from "../sync-client-error";
import type { LocalCommand } from "./local-store";

const unnumberedEnvelopeSchema = syncCommandEnvelopeSchema.omit({ deviceSeq: true });
const targetRefSchema = syncChangeSchema.pick({ entity: true, entityId: true });

/**
 * Refuses a command the server would not take before it reaches the outbox. The server
 * answers a batch with one malformed envelope with 400 for the whole batch, so a single bad
 * command recorded offline would stall every command queued behind it, for good.
 */
export function validateLocalCommand({ target, ...envelope }: LocalCommand): LocalCommand {
  const parsed = unnumberedEnvelopeSchema.safeParse(envelope);
  const ref = targetRefSchema.safeParse({ entity: target.entity, entityId: target.entityId });
  const optimistic = entitySnapshotSchema.safeParse(target.optimistic);
  if (!parsed.success || !ref.success || !optimistic.success) {
    throw new SyncClientError(SYNC_CLIENT_ERROR_CODES.invalidCommand);
  }
  return { ...parsed.data, target: { ...ref.data, optimistic: optimistic.data } };
}
