// The wire format between the till and the server: bigints travel as strings, because JSON has
// no integer bigger than 2^53. Both directions walk the value instead of handing JSON a
// replacer or reviver, which are several times slower and dominated the long property runs.
const BIGINT_TEXT = /^-?\d+n$/;

const mapLeaves = (v: unknown, leaf: (x: unknown) => unknown): unknown => {
  if (Array.isArray(v)) return v.map((x) => mapLeaves(x, leaf));
  if (v === null || typeof v !== "object") return leaf(v);
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) out[k] = mapLeaves(x, leaf);
  return out;
};

export const toJson = (value: unknown): string =>
  JSON.stringify(mapLeaves(value, (x) => (typeof x === "bigint" ? `${x.toString()}n` : x)));

export const fromJson = <T>(text: string): T =>
  mapLeaves(JSON.parse(text), (x) =>
    typeof x === "string" && BIGINT_TEXT.test(x) ? BigInt(x.slice(0, -1)) : x,
  ) as T;

/** What the other side reads back after the value went over the wire. */
export const overTheWire = <T>(value: T): T => fromJson<T>(toJson(value));

/** Deep equality of plain data (what goes over the wire), without vitest's matcher machinery. */
export function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  return ka.every((k) => k in rb && sameData(ra[k], rb[k]));
}
