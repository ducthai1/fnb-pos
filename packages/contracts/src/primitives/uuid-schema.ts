import { z } from "zod";

const LOWERCASE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * An id on the wire, in the one spelling ids are generated in: lowercase 8-4-4-4-12.
 * Postgres treats "ABC…" and "abc…" as the same uuid, but an outbox, a cache key or a
 * change log compares ids as text; accepting both would let one command or row travel
 * under two names.
 */
export const uuidSchema = z.string().regex(LOWERCASE_UUID, { message: "not a lowercase uuid" });
