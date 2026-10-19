import { z } from "zod";
import { changeSeqSchema } from "../sync/sync-changes-page-schema";

/**
 * The version of a menu or settings copy sent to a till: the change sequence number it was
 * taken at, the feed cursor for a bootstrap copy. These copies are assembled from several
 * rows (a product with groups other products share, a till's settings inherited from three
 * levels), so no single row version grows with every change to them; the feed position
 * does, and a till keeps a copy only when its version is strictly newer.
 */
export const feedVersionSchema = z.number().int().safe().nonnegative();

/** Where a till starts pulling: "0" before anything was ever written, else a change_seq. */
export const feedCursorSchema = z.union([z.literal("0"), changeSeqSchema]);
