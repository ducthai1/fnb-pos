import { describe, expect, it } from "vitest";
import { errorOf } from "../catalog/catalog-test-helpers";
import { basisPoints, vnd } from "../money";
import { type PermissionAction, authorize, validateGrants } from "./authorize";
import type { Grant } from "./permission-catalog";
import { PERMISSIONS_ERROR_CODES } from "./permissions-error-codes";
import { actionFor, cashGrant, corrupt, rateGrant } from "./permissions-test-helpers";

// Grants come from stored role data and actions from synced commands, so both are checked
// at run time even though the types already rule most of these out.
const codeOf = (action: PermissionAction, grants: readonly Grant[] = []) =>
  errorOf(() => authorize(action, grants)).code;

const CORRUPT_GRANTS: [string, unknown][] = [
  ["a threshold on a key that has none", { key: "refund", threshold: { maxRate: 100 } }],
  ["an amount cap on a rate key", { key: "line_discount", threshold: { maxAmount: 100n } }],
  ["a rate cap on an amount key", { key: "cash_move", threshold: { maxRate: 100 } }],
  ["both caps at once", { key: "cash_move", threshold: { maxAmount: 1n, maxRate: 1 } }],
  ["a negative amount cap", { key: "cash_move", threshold: { maxAmount: -1n } }],
  ["an amount cap as a number", { key: "cash_move", threshold: { maxAmount: 100 } }],
  ["a rate cap above 100%", { key: "order_discount", threshold: { maxRate: 10_001 } }],
  ["a fractional rate cap", { key: "order_discount", threshold: { maxRate: 10.5 } }],
  ["an empty threshold", { key: "line_discount", threshold: {} }],
  ["a threshold that is a bare number", { key: "line_discount", threshold: 1_000 }],
  ["a threshold that is null", { key: "cash_move", threshold: null }],
];

describe("authorize rejects a corrupt grant", () => {
  const refund = actionFor("refund");

  it("accepts well-formed grants with and without thresholds", () => {
    const grants = [
      rateGrant("line_discount", 0),
      cashGrant(0),
      { key: "order_discount" } as Grant,
    ];
    expect(authorize(refund, grants)).toBe("needs_approval");
  });

  it.each(CORRUPT_GRANTS)("rejects %s, even when the action is about another key", (_, grant) => {
    expect(codeOf(refund, [corrupt<Grant>(grant)])).toBe(PERMISSIONS_ERROR_CODES.invalidGrant);
  });
});

describe("validateGrants checks role data on its own, before any action exists", () => {
  it("accepts well-formed grants, and no grants at all", () => {
    expect(() => validateGrants([rateGrant("order_discount", 500), cashGrant(1)])).not.toThrow();
    expect(() => validateGrants([])).not.toThrow();
  });

  it.each(CORRUPT_GRANTS)("rejects %s", (_, grant) => {
    expect(errorOf(() => validateGrants([corrupt<Grant>(grant)])).code).toBe(
      PERMISSIONS_ERROR_CODES.invalidGrant,
    );
  });

  it("rejects a key the catalog does not know", () => {
    expect(errorOf(() => validateGrants([corrupt<Grant>({ key: "order.create" })])).code).toBe(
      PERMISSIONS_ERROR_CODES.unknownKey,
    );
  });
});

describe("authorize rejects an action without the value its key is judged by", () => {
  it.each([
    ["a discount without a rate", { key: "line_discount" }],
    ["a cash move without an amount", { key: "cash_move" }],
    ["a discount carrying an amount", { key: "order_discount", discountRate: 0, amount: 1n }],
    ["a cash move carrying a rate", { key: "cash_move", amount: 1n, discountRate: 0 }],
    ["a plain key carrying a rate", { key: "refund", discountRate: 0 }],
    ["a plain key carrying an amount", { key: "refund", amount: 0n }],
    ["a negative cash amount", { key: "cash_move", amount: -1n }],
    ["a rate above 100%", { key: "line_discount", discountRate: 10_001 }],
    ["a negative rate", { key: "line_discount", discountRate: -1 }],
  ])("%s", (_, action) => {
    const grants = [{ key: "line_discount" }, { key: "cash_move" }, { key: "refund" }] as Grant[];
    expect(codeOf(corrupt<PermissionAction>(action), grants)).toBe(
      PERMISSIONS_ERROR_CODES.invalidActionValue,
    );
  });

  it("accepts the zero values that are legitimate", () => {
    expect(authorize({ key: "line_discount", discountRate: basisPoints(0) }, [])).toBe(
      "needs_approval",
    );
    expect(authorize({ key: "cash_move", amount: vnd(0) }, [cashGrant(0)])).toBe("allowed");
  });
});
