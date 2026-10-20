// Assertions for the LocalStore contract. The cases run under Vitest and inside a browser
// page that has no test runner, so they cannot use Vitest's expect; these mirror the few
// matchers they need (toEqual, toMatchObject, rejects.toThrow) with the same semantics.

export class ContractAssertionError extends Error {
  override name = "ContractAssertionError";
}

const show = (value: unknown): string =>
  JSON.stringify(value, (_key, inner: unknown) =>
    typeof inner === "bigint" ? `${inner}n` : inner === undefined ? "<undefined>" : inner,
  ) ?? String(value);

type PlainObject = Record<string, unknown>;
const isObject = (value: unknown): value is PlainObject =>
  typeof value === "object" && value !== null;

/** Like toMatchObject when `partial`, else like toEqual: an undefined key counts as absent. */
function same(actual: unknown, expected: unknown, partial: boolean): boolean {
  if (Object.is(actual, expected)) return true;
  if (!isObject(actual) || !isObject(expected)) return false;
  if (Array.isArray(actual) !== Array.isArray(expected)) return false;
  if (Array.isArray(actual) && Array.isArray(expected)) {
    return (
      actual.length === expected.length &&
      actual.every((item, i) => same(item, expected[i], partial))
    );
  }
  const keys = (object: PlainObject) => Object.keys(object).filter((k) => object[k] !== undefined);
  const expectedKeys = keys(expected);
  if (!partial && keys(actual).length !== expectedKeys.length) return false;
  return expectedKeys.every((key) => same(actual[key], expected[key], partial));
}

export function assertEqual(actual: unknown, expected: unknown, what = "value"): void {
  if (!same(actual, expected, false)) {
    throw new ContractAssertionError(`${what}: expected ${show(expected)}, got ${show(actual)}`);
  }
}

export function assertMatches(actual: unknown, expected: object, what = "value"): void {
  if (!same(actual, expected, true)) {
    throw new ContractAssertionError(
      `${what}: expected to match ${show(expected)}, got ${show(actual)}`,
    );
  }
}

/** Waits for `work` and fails unless it was refused with a message matching `message`. */
export async function assertRejects(work: Promise<unknown>, message: RegExp): Promise<void> {
  const outcome = await work.then(
    () => null,
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  );
  if (outcome === null) throw new ContractAssertionError(`expected a refusal matching ${message}`);
  if (!message.test(outcome)) {
    throw new ContractAssertionError(`expected a refusal matching ${message}, got "${outcome}"`);
  }
}
