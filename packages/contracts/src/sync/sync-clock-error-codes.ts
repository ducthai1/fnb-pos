/**
 * Codes of sync results about the till's clock. The server decides time: nothing a till
 * records can have happened after the server heard of it, so a command dated too far ahead
 * of when it arrived is not taken. It is not refused either (it may be a sale already paid
 * for in cash): it is sent back to retry, and the till dates it again by the server's clock.
 */
export const SYNC_CLOCK_ERROR_CODES = {
  /** The retry code: createdAt is more than two minutes after the server received it. */
  deviceClockAhead: "SYNC_DEVICE_CLOCK_AHEAD",
} as const;
