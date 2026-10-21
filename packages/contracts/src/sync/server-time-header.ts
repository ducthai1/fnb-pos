import { z } from "zod";

/**
 * The response header carrying the server's clock, in whole milliseconds since the epoch:
 * sent on every sync answer and the bootstrap. A till measures how far its own clock is off
 * from it and dates its commands by the server's time, so a shop PC whose clock runs fast
 * (a flat CMOS battery, Windows time sync stopped) still has every command taken.
 */
export const SERVER_TIME_HEADER = "x-fnb-server-time";

export const serverTimeSchema = z
  .string()
  .regex(/^\d{1,15}$/)
  .transform(Number);
