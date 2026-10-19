import {
  FULL_RATE,
  type Grant,
  PERMISSION_DEFINITIONS,
  PERMISSION_KEYS,
  PERMISSIONS_ERROR_CODES,
  type PermissionKey,
  ROLE_TEMPLATES,
  basisPoints,
  isDomainError,
  vnd,
} from "@fnb/domain";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { decodeRoleGrants, encodeRoleGrants } from "./role-grants-codec";

const codeOf = (work: () => unknown): string => {
  try {
    work();
  } catch (error) {
    return isDomainError(error) ? error.code : "not-a-domain-error";
  }
  return "no-error";
};

const grantOf = (key: PermissionKey): fc.Arbitrary<Grant> => {
  const kind = PERMISSION_DEFINITIONS[key].threshold;
  if (kind === "max_rate") {
    return fc
      .option(fc.integer({ min: 0, max: FULL_RATE }), { nil: undefined })
      .map(
        (rate) =>
          (rate === undefined
            ? { key }
            : { key, threshold: { maxRate: basisPoints(rate) } }) as Grant,
      );
  }
  if (kind === "max_amount") {
    return fc
      .option(fc.bigInt({ min: 0n, max: 10n ** 18n }), { nil: undefined })
      .map(
        (amount) =>
          (amount === undefined
            ? { key }
            : { key, threshold: { maxAmount: vnd(amount) } }) as Grant,
      );
  }
  return fc.constant({ key } as Grant);
};

const grantsArbitrary = fc
  .shuffledSubarray([...PERMISSION_KEYS])
  .chain((keys) => fc.tuple(...keys.map(grantOf)));

// What jsonb hands back: the stored form after a trip through JSON text.
const throughJson = (grants: readonly Grant[]) => {
  const stored = encodeRoleGrants(grants);
  return decodeRoleGrants(stored.permissionKeys, JSON.parse(JSON.stringify(stored.thresholds)));
};

describe("role grants as stored in a role's columns", () => {
  it("read back exactly as written, in order, limits included", () => {
    fc.assert(
      fc.property(grantsArbitrary, (grants) => {
        expect(throughJson(grants)).toEqual(grants);
      }),
    );
  });

  it("keep money as a decimal string and rates as basis points", () => {
    expect(encodeRoleGrants(ROLE_TEMPLATES.cashier.grants)).toEqual({
      permissionKeys: ["line_discount", "cash_move", "open_price", "transfer_table"],
      thresholds: { line_discount: { maxRate: 1_000 }, cash_move: { maxAmount: "500000" } },
    });
  });

  it("round-trip every role template", () => {
    for (const template of Object.values(ROLE_TEMPLATES)) {
      expect(throughJson(template.grants)).toEqual(template.grants);
    }
  });

  it("refuse to write two grants of one key, which one row of limits cannot hold", () => {
    const twice = [{ key: "refund" }, { key: "refund" }] as Grant[];
    expect(codeOf(() => encodeRoleGrants(twice))).toBe(PERMISSIONS_ERROR_CODES.invalidGrant);
  });
});

describe("decoding role columns rejects what the domain would not accept", () => {
  it("names a key outside the catalog as unknown", () => {
    expect(codeOf(() => decodeRoleGrants(["refund", "order.create"], {}))).toBe(
      PERMISSIONS_ERROR_CODES.unknownKey,
    );
  });

  it.each([
    ["an amount cap as a JSON number", { cash_move: { maxAmount: 500_000 } }],
    ["a negative amount cap", { cash_move: { maxAmount: "-1" } }],
    ["a fractional amount cap", { cash_move: { maxAmount: "1.5" } }],
    ["an amount cap with leading zeros", { cash_move: { maxAmount: "0500" } }],
    ["a rate cap as a string", { line_discount: { maxRate: "1000" } }],
    ["a rate cap above 100%", { line_discount: { maxRate: 10_001 } }],
    ["an amount cap on a rate key", { line_discount: { maxAmount: "1" } }],
    ["a limit on a key that has none", { refund: { maxRate: 1 } }],
    ["a limit that is not an object", { line_discount: 1_000 }],
    ["a limit on a key the role does not hold", { order_discount: { maxRate: 1 } }],
  ])("rejects %s", (_, thresholds) => {
    const keys = ["refund", "line_discount", "cash_move"];
    expect(codeOf(() => decodeRoleGrants(keys, thresholds))).toBe(
      PERMISSIONS_ERROR_CODES.invalidGrant,
    );
  });

  it.each([
    ["an array", []],
    ["null", null],
    ["a string", "{}"],
  ])("rejects thresholds that are %s", (_, thresholds) => {
    expect(codeOf(() => decodeRoleGrants(["refund"], thresholds))).toBe(
      PERMISSIONS_ERROR_CODES.invalidGrant,
    );
  });

  it("rejects a key listed twice", () => {
    expect(codeOf(() => decodeRoleGrants(["refund", "refund"], {}))).toBe(
      PERMISSIONS_ERROR_CODES.invalidGrant,
    );
  });

  it("accepts a role with no grants, and the zero limits that are legitimate", () => {
    expect(decodeRoleGrants([], {})).toEqual([]);
    expect(
      decodeRoleGrants(["line_discount", "cash_move"], {
        line_discount: { maxRate: 0 },
        cash_move: { maxAmount: "0" },
      }),
    ).toEqual([
      { key: "line_discount", threshold: { maxRate: 0 } },
      { key: "cash_move", threshold: { maxAmount: 0n } },
    ]);
  });
});
