/**
 * JSON text for a jsonb payload. Money is bigint đồng, which JSON.stringify refuses and a
 * JSON number would round past 2^53, so bigints are written as decimal strings: the value
 * stays exact and reads back with BigInt(text).
 */
export function toJsonPayload(payload: Readonly<Record<string, unknown>>): string {
  return JSON.stringify(payload, (_key, value: unknown) =>
    typeof value === "bigint" ? value.toString() : value,
  );
}
