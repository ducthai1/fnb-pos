import { describe, expect, it } from "vitest";
import { parseStaffGrants } from "./staff-grants";

const answer = (grants: unknown) => ({ staffId: "s", displayName: "Lan", grants });

describe("the grants the till reads for the staff member signed in", () => {
  it("reads keys and caps, money caps as đồng", () => {
    const grants = parseStaffGrants(
      answer({
        permissionKeys: ["line_discount", "cash_move", "open_price"],
        thresholds: { line_discount: { maxRate: 1000 }, cash_move: { maxAmount: "500000" } },
      }),
    );
    expect(grants).toEqual([
      { key: "line_discount", threshold: { maxRate: 1000 } },
      { key: "cash_move", threshold: { maxAmount: 500_000n } },
      { key: "open_price" },
    ]);
  });

  it("reads a role with no keys as granting nothing", () => {
    expect(parseStaffGrants(answer({ permissionKeys: [], thresholds: {} }))).toEqual([]);
  });

  it.each([
    ["an unknown key", { permissionKeys: ["fly"], thresholds: {} }],
    ["a cap on a key the role does not hold", { permissionKeys: [], thresholds: { refund: {} } }],
    [
      "a money cap that is not whole đồng",
      { permissionKeys: ["cash_move"], thresholds: { cash_move: { maxAmount: "5e5" } } },
    ],
    [
      "a rate cap on a money key",
      { permissionKeys: ["cash_move"], thresholds: { cash_move: { maxRate: 1000 } } },
    ],
    ["keys that are not a list", { permissionKeys: "refund", thresholds: {} }],
  ])("refuses %s rather than guess what it allows", (_case, grants) => {
    expect(parseStaffGrants(answer(grants))).toBeNull();
  });

  it("refuses an answer without grants", () => {
    expect(parseStaffGrants({ staffId: "s" })).toBeNull();
    expect(parseStaffGrants(null)).toBeNull();
  });
});
