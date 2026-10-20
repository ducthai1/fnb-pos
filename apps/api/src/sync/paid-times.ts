import type { CommandTime } from "./command-time";

/**
 * The three times a payment or a sale invoice is stored with, in this order: when it counts
 * as having happened (the one reports and the law read), what the till's clock showed, and
 * when the server received it. Keeping all three lets anyone see how far a till was off.
 */
export function paidTimesOf(time: CommandTime): [Date, Date, Date] {
  return [time.effectiveAt, time.deviceAt, time.receivedAt];
}
