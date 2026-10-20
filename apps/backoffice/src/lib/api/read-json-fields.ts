/*
 * Small readers for answer bodies. They check what a screen relies on and refuse the rest,
 * so a malformed answer shows as a failed call instead of a crash deep inside a screen.
 */

export type JsonRecord = Record<string, unknown>;

export const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const textOf = (record: JsonRecord, key: string): string | null => {
  const value = record[key];
  return typeof value === "string" ? value : null;
};

export const nullableTextOf = (record: JsonRecord, key: string): string | null | undefined => {
  const value = record[key];
  if (value === null) return null;
  return typeof value === "string" ? value : undefined;
};

export const wholeNumberOf = (record: JsonRecord, key: string): number | null => {
  const value = record[key];
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
};

/**
 * Every element of `list` read by `read`, or null when `list` is not an array or any
 * element does not read: a list with a hole would show a menu or a staff list incomplete.
 */
export function listOf<T>(list: unknown, read: (item: JsonRecord) => T | null): T[] | null {
  if (!Array.isArray(list)) return null;
  const items: T[] = [];
  for (const item of list) {
    const value = isRecord(item) ? read(item) : null;
    if (value === null) return null;
    items.push(value);
  }
  return items;
}

/** The array under `key` of an object body, read element by element. */
export const listUnder = <T>(body: unknown, key: string, read: (item: JsonRecord) => T | null) =>
  isRecord(body) ? listOf(body[key], read) : null;

/** What a contract schema of @fnb/contracts offers; zod itself stays the contracts' concern. */
export interface ContractSchema<T> {
  safeParse(input: unknown): { success: true; data: T } | { success: false };
}

/** The body as the contract describes it, or null when it is not that shape. */
export function parsedBy<T>(schema: ContractSchema<T>, body: unknown): T | null {
  const parsed = schema.safeParse(body);
  return parsed.success ? parsed.data : null;
}
