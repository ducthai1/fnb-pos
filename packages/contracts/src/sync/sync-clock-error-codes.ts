/**
 * Codes of sync results about the till's clock; the till maps them to Vietnamese messages.
 * The server decides time: a command dated too far ahead of when it arrived is refused,
 * since nothing a till records can have happened after the server heard of it.
 */
export const SYNC_CLOCK_ERROR_CODES = {
  /** createdAt is more than two minutes after the server received the command. */
  deviceClockAhead: "SYNC_DEVICE_CLOCK_AHEAD",
} as const;
