import { SYNC_CLOCK_ERROR_CODES } from "@fnb/contracts";
import { businessDate } from "@fnb/domain";

const MINUTE = 60_000;

/**
 * How far a till's clock may disagree with the server's. A command cannot have been made
 * after the server received it, so one dated more than two minutes ahead is refused. Up to
 * two minutes ahead is a clock that drifts a little, forgiven: the command is acted on at
 * the till's own time, the time the till priced it and showed the customer, so a sale made
 * on a fast till at the start of happy hour is not repriced (and its payment refused) by
 * the server a minute earlier. One dated earlier is believed for up to 12 hours, enough for
 * a till that sold offline through a shift; an older date is held at 12 hours, so moving a
 * till's clock back cannot reach yesterday's prices or closed days.
 */
export const DEVICE_CLOCK_LIMITS = { aheadMs: 2 * MINUTE, behindMs: 12 * 60 * MINUTE } as const;

export interface BranchDayClock {
  readonly utcOffsetMinutes: number;
  readonly businessDayStartMinute: number;
}

export interface CommandTime {
  /** What the till wrote in createdAt: stored for the record, never decided on. */
  readonly deviceAt: Date;
  /** When the server received the command, by the API's clock. */
  readonly receivedAt: Date;
  /**
   * The moment every business rule uses: deviceAt itself within the limits around
   * receivedAt (up to two minutes after it, twelve hours before), else held at the limit.
   */
  readonly effectiveAt: Date;
  /** The branch's business day of effectiveAt. */
  readonly businessDate: string;
  /** deviceAt − effectiveAt: below 0 for a till held back, else 0 (only that is noted). */
  readonly clampedByMs: number;
}

export type CommandTimeReading =
  | { readonly ok: true; readonly time: CommandTime }
  | {
      readonly ok: false;
      readonly code: typeof SYNC_CLOCK_ERROR_CODES.deviceClockAhead;
      readonly aheadMs: number;
    };

/** The one place a command's time is decided: refused, or the moment to act on. */
export function readCommandTime(
  createdAt: string,
  receivedAt: Date,
  branch: BranchDayClock,
  limits: { aheadMs: number; behindMs: number } = DEVICE_CLOCK_LIMITS,
): CommandTimeReading {
  const device = Date.parse(createdAt);
  const received = receivedAt.getTime();
  if (Number.isNaN(device)) throw new Error("createdAt must be checked before its time is read");
  if (device - received > limits.aheadMs) {
    return { ok: false, code: SYNC_CLOCK_ERROR_CODES.deviceClockAhead, aheadMs: device - received };
  }
  const effective = Math.max(device, received - limits.behindMs);
  return {
    ok: true,
    time: {
      deviceAt: new Date(device),
      receivedAt: new Date(received),
      effectiveAt: new Date(effective),
      businessDate: businessDate(effective, {
        utcOffsetMinutes: branch.utcOffsetMinutes,
        dayStartMinute: branch.businessDayStartMinute,
      }),
      clampedByMs: device - effective,
    },
  };
}
