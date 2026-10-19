import { z } from "zod";

/** A moment on the wire: ISO 8601 with "Z" or an explicit offset, never a bare local time. */
export const instantSchema = z.string().datetime({ offset: true });
