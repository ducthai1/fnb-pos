import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { errorOf } from "../catalog/catalog-test-helpers";
import { basisPoints, vnd } from "../money";
import {
  type AuthorizationResult,
  type PermissionAction,
  authorize,
  canApprove,
} from "./authorize";
import {
  type Grant,
  PERMISSION_DEFINITIONS,
  PERMISSION_KEYS,
  type PermissionKey,
} from "./permission-catalog";
import { PERMISSIONS_ERROR_CODES } from "./permissions-error-codes";
import { actionFor, cashGrant, rateGrant } from "./permissions-test-helpers";

// Written out by hand rather than read from the catalog, so making a key lendable (or
// not) by accident fails here instead of passing silently.
const NEVER_LENT: readonly PermissionKey[] = [
  "view_reports",
  "edit_menu",
  "manage_staff",
  "manage_devices",
  "manage_settings",
];
const LIMITED = ["line_discount", "order_discount", "cash_move"] as const;

describe.each(PERMISSION_KEYS)("authorize %s", (key) => {
  const lendable = !NEVER_LENT.includes(key);

  it("allows a holder of the key", () => {
    expect(authorize(actionFor(key, 5_000), [{ key } as Grant])).toBe("allowed");
  });

  it(`without the key: ${lendable ? "needs approval" : "is denied"}`, () => {
    const other: Grant = { key: key === "refund" ? "transfer_table" : "refund" };
    const expected = lendable ? "needs_approval" : "denied";
    expect(authorize(actionFor(key, 5_000), [])).toBe(expected);
    expect(authorize(actionFor(key, 5_000), [other])).toBe(expected);
  });

  it(`can ${lendable ? "" : "never "}be approved by a holder`, () => {
    expect(canApprove(actionFor(key, 5_000), [{ key } as Grant])).toBe(lendable);
  });

  it("can never be approved by someone who does not hold it", () => {
    expect(canApprove(actionFor(key, 5_000), [])).toBe(false);
  });
});

describe("thresholds", () => {
  it.each(["line_discount", "order_discount"] as const)(
    "%s is allowed up to the cap inclusive and needs approval above it",
    (key) => {
      const grants = [rateGrant(key, 1_000)];
      expect(authorize(actionFor(key, 0), grants)).toBe("allowed");
      expect(authorize(actionFor(key, 1_000), grants)).toBe("allowed");
      expect(authorize(actionFor(key, 1_001), grants)).toBe("needs_approval");
      expect(authorize(actionFor(key, 10_000), grants)).toBe("needs_approval");
    },
  );

  it("cash_move is allowed up to the cap inclusive and needs approval above it", () => {
    const grants = [cashGrant(500_000)];
    expect(authorize(actionFor("cash_move", 500_000), grants)).toBe("allowed");
    expect(authorize(actionFor("cash_move", 500_001), grants)).toBe("needs_approval");
  });

  it.each(LIMITED)("%s without a threshold has no limit", (key) => {
    const value = key === "cash_move" ? 1_000_000_000 : 10_000;
    expect(authorize(actionFor(key, value), [{ key }])).toBe("allowed");
  });

  it("takes the most generous of several grants of one key, whatever their order", () => {
    const capped = rateGrant("line_discount", 500);
    const wider = rateGrant("line_discount", 2_000);
    const action = actionFor("line_discount", 1_500);
    expect(authorize(action, [capped, wider])).toBe("allowed");
    expect(authorize(action, [wider, capped])).toBe("allowed");
    expect(authorize(action, [capped, { key: "line_discount" }])).toBe("allowed");
    expect(authorize(action, [capped])).toBe("needs_approval");
  });

  it("does not let a line discount cap cover an order discount", () => {
    const action = actionFor("order_discount", 500);
    expect(authorize(action, [rateGrant("line_discount", 1_000)])).toBe("needs_approval");
  });
});

describe("canApprove", () => {
  it("lets an approver whose own cap covers the action approve it", () => {
    const action = actionFor("line_discount", 3_000);
    expect(canApprove(action, [rateGrant("line_discount", 5_000)])).toBe(true);
    expect(canApprove(actionFor("cash_move", 2_000_000), [cashGrant(2_000_000)])).toBe(true);
  });

  it("refuses an approver whose own cap is below the action", () => {
    expect(canApprove(actionFor("line_discount", 3_000), [rateGrant("line_discount", 2_000)])).toBe(
      false,
    );
    expect(canApprove(actionFor("cash_move", 2_000_001), [cashGrant(2_000_000)])).toBe(false);
  });
});

describe("invalid input", () => {
  const codeOf = (fn: () => unknown) => errorOf(fn).code;

  it("rejects an unknown action key and an unknown granted key", () => {
    const unknown = { key: "delete_everything" } as unknown as Grant;
    expect(codeOf(() => authorize({ key: "delete_everything" as PermissionKey }, []))).toBe(
      PERMISSIONS_ERROR_CODES.unknownKey,
    );
    expect(codeOf(() => canApprove({ key: "delete_everything" as PermissionKey }, []))).toBe(
      PERMISSIONS_ERROR_CODES.unknownKey,
    );
    expect(codeOf(() => authorize(actionFor("refund"), [unknown]))).toBe(
      PERMISSIONS_ERROR_CODES.unknownKey,
    );
  });
});

describe("authorize is monotonic in the grants it is given", () => {
  const RANK: Record<AuthorizationResult, number> = { denied: 0, needs_approval: 1, allowed: 2 };
  const key = fc.constantFrom(...PERMISSION_KEYS);
  const rate = fc.integer({ min: 0, max: 10_000 }).map(basisPoints);
  const amount = fc.bigInt({ min: 0n, max: 10n ** 10n }).map(vnd);

  const grant: fc.Arbitrary<Grant> = key.chain((k): fc.Arbitrary<Grant> => {
    const kind = PERMISSION_DEFINITIONS[k].threshold;
    if (kind === "max_rate") {
      return fc
        .option(rate, { nil: undefined })
        .map((maxRate) =>
          maxRate === undefined
            ? ({ key: k } as Grant)
            : ({ key: k, threshold: { maxRate } } as Grant),
        );
    }
    if (kind === "max_amount") {
      return fc
        .option(amount, { nil: undefined })
        .map((maxAmount) =>
          maxAmount === undefined
            ? ({ key: k } as Grant)
            : ({ key: k, threshold: { maxAmount } } as Grant),
        );
    }
    return fc.constant({ key: k } as Grant);
  });

  const action: fc.Arbitrary<PermissionAction> = key.chain((k): fc.Arbitrary<PermissionAction> => {
    const kind = PERMISSION_DEFINITIONS[k].threshold;
    if (kind === "max_rate") return rate.map((discountRate) => ({ key: k, discountRate }));
    if (kind === "max_amount") return amount.map((value) => ({ key: k, amount: value }));
    return fc.constant({ key: k });
  });
  const grants = fc.array(grant, { maxLength: 8 });

  it("never gives a worse answer for one more grant, wherever it is added", () => {
    fc.assert(
      fc.property(action, grants, grant, (a, g, extra) => {
        const before = RANK[authorize(a, g)];
        expect(RANK[authorize(a, [...g, extra])]).toBeGreaterThanOrEqual(before);
        expect(RANK[authorize(a, [extra, ...g])]).toBeGreaterThanOrEqual(before);
      }),
      { numRuns: 500 },
    );
  });

  it("does not depend on the order of the grants", () => {
    fc.assert(
      fc.property(action, grants, (a, g) => {
        expect(authorize(a, [...g].reverse())).toBe(authorize(a, g));
      }),
      { numRuns: 300 },
    );
  });

  it("only lets an approver approve what the approver is allowed alone", () => {
    fc.assert(
      fc.property(action, grants, (a, g) => {
        if (canApprove(a, g)) expect(authorize(a, g)).toBe("allowed");
      }),
      { numRuns: 300 },
    );
  });
});
