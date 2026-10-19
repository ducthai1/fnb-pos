/** Codes for what the till's own sync layer refuses; the POS maps them to Vietnamese messages. */
export const SYNC_CLIENT_ERROR_CODES = {
  /** The command does not match the sync envelope contract, so the server would refuse the batch. */
  invalidCommand: "SYNC_CLIENT_INVALID_COMMAND",
  /** A command with this id is already in the outbox. */
  commandIdTaken: "SYNC_CLIENT_COMMAND_ID_TAKEN",
  /** The local database belongs to another till: its device_seq would collide on the server. */
  deviceMismatch: "SYNC_CLIENT_DEVICE_MISMATCH",
  /** The server sent a cursor behind the one stored: keeping it would replay or skip changes. */
  cursorRegressed: "SYNC_CLIENT_CURSOR_REGRESSED",
  /** A pulled change at or before the stored cursor: the page is not the one asked for. */
  staleChange: "SYNC_CLIENT_STALE_CHANGE",
  /** A server snapshot without a whole-number version cannot be ordered against another. */
  snapshotWithoutVersion: "SYNC_CLIENT_SNAPSHOT_WITHOUT_VERSION",
  /** A command result carries the row of an entity the command is not about. */
  snapshotOfAnotherEntity: "SYNC_CLIENT_SNAPSHOT_OF_ANOTHER_ENTITY",
  /** The server answered for a command that was not in the batch, or twice for one. */
  unexpectedResult: "SYNC_CLIENT_UNEXPECTED_RESULT",
} as const;

export type SyncClientErrorCode =
  (typeof SYNC_CLIENT_ERROR_CODES)[keyof typeof SYNC_CLIENT_ERROR_CODES];

export class SyncClientError extends Error {
  constructor(readonly code: SyncClientErrorCode) {
    super(code);
    this.name = "SyncClientError";
  }
}

export const isSyncClientError = (error: unknown): error is SyncClientError =>
  error instanceof SyncClientError;
