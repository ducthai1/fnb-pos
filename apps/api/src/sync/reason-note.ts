import { reasonNeedsNote } from "@fnb/contracts";
import { CommandRejection, SYNC_ERROR_CODES } from "./sync-error-codes";

/**
 * Refuses a void, cancel or refund whose reason is "other" and that says nothing more: the
 * reports would show money taken back or food thrown away for no reason anyone can read.
 * The note's length is the contract's; here only whether one is there.
 */
export function assertReasonExplained(payload: {
  readonly reasonCode: string;
  readonly reasonNote?: string | undefined;
}): void {
  if (reasonNeedsNote(payload.reasonCode) && payload.reasonNote === undefined) {
    throw new CommandRejection(SYNC_ERROR_CODES.reasonNoteRequired);
  }
}
