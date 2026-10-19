/**
 * A uuid exactly as Postgres writes one back: lowercase hex in 8-4-4-4-12 groups. The JSON
 * schema "uuid" format also takes upper case and a `urn:uuid:` prefix. Postgres refuses
 * the prefix, which surfaced as a 500 instead of a 400, and ids are compared as strings
 * all through the API, so an upper-case id silently matched nothing. Every uuid a route
 * accepts, in params, query or body, goes through this one shape.
 */
export const UUID_PATTERN = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";

export const UUID_REGEX = new RegExp(UUID_PATTERN);

/** For a Fastify JSON schema; a mismatch answers 400 API_INVALID_REQUEST. */
export const uuidJsonSchema = { type: "string", pattern: UUID_PATTERN } as const;

/**
 * Whether two ids name the same row, for ids that did not come through a route schema:
 * uuids are case-insensitive, so comparing their strings as written is not enough.
 */
export function sameUuid(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
