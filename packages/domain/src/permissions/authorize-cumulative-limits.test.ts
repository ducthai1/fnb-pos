import { describe, expect, it } from "vitest";
import { basisPoints, vnd } from "../money";
import { order } from "../order/order-line-test-fixtures";
import { projectedDiscountRate } from "../totals";
import { VAT_8, discountLine, itemLine } from "../totals/totals-test-helpers";
import { authorize } from "./authorize";
import { ROLE_TEMPLATES } from "./role-templates";

const cashier = ROLE_TEMPLATES.cashier.grants; // line discount up to 10%, cash moves up to 500.000

describe("authorize judges a limited key by the cumulative value, not the step", () => {
  it("lets a cashier give one 10% discount on a tea, but not a second or third one", () => {
    let current = order([itemLine("tea", 100_000, VAT_8)]);
    const results = ["d1", "d2", "d3"].map((id) => {
      const proposed = [discountLine(id, "tea", 10_000, VAT_8)];
      const rate = projectedDiscountRate(current, proposed, { kind: "line", lineId: "tea" });
      const result = authorize({ key: "line_discount", discountRate: rate }, cashier);
      current = { ...current, lines: [...current.lines, ...proposed] }; // a manager approved it
      return result;
    });
    expect(results).toEqual(["allowed", "needs_approval", "needs_approval"]);
    // judged on its own, each step would have passed
    expect(authorize({ key: "line_discount", discountRate: basisPoints(1_000) }, cashier)).toBe(
      "allowed",
    );
  });

  it("lets a cashier move 500.000 đ in a shift alone, in one move or several, and no more", () => {
    const inShift = (total: number) => authorize({ key: "cash_move", amount: vnd(total) }, cashier);
    expect([inShift(200_000), inShift(500_000), inShift(500_001)]).toEqual([
      "allowed",
      "allowed",
      "needs_approval",
    ]);
    // ten moves of 500.000: the second already brings the shift to 1.000.000
    const tenMoves = Array.from({ length: 10 }, (_, k) => inShift((k + 1) * 500_000));
    expect(tenMoves.filter((r) => r === "allowed")).toHaveLength(1);
  });
});
