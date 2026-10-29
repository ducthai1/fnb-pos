import { describe, expect, it } from "vitest";
import { checkPriceListDraft, rulePath } from "./check-price-list-draft";
import { daysText, describeRule } from "./describe-rule";
import { type PriceListDraft, type RuleDraft, emptyListDraft, emptyRule } from "./price-list-draft";

const BRAND = "0190a000-0000-7000-8000-0000000000a1";
const RULE = "0190a000-0000-7000-8000-0000000000c1";
const base = (rules: RuleDraft[], name = "Giờ vàng"): PriceListDraft => ({ ...emptyListDraft("0190a000-0000-7000-8000-0000000000d1", BRAND), name, rules });
const happyHour = (patch: Partial<RuleDraft> = {}): RuleDraft => ({ ...emptyRule(RULE), value: "20", start: "14:00", end: "17:00", days: [1, 2, 3, 4, 5], ...patch });
const errorsOf = (draft: PriceListDraft) => {
  const check = checkPriceListDraft(draft);
  if (check.ok) throw new Error("expected errors");
  return check.errors;
};

describe("checking a price list draft", () => {
  it("turns a happy hour into the body the API takes", () => {
    const check = checkPriceListDraft(base([happyHour()]));
    expect(check).toEqual({
      ok: true,
      body: {
        version: null,
        brandId: BRAND,
        name: "Giờ vàng",
        items: [
          {
            id: RULE,
            scope: { kind: "global" },
            branchId: null,
            channelKey: null,
            validFrom: null,
            validTo: null,
            daysOfWeek: [1, 2, 3, 4, 5],
            timeWindow: { startMinute: 840, endMinute: 1020 },
            effect: { kind: "percent_off", rateBp: 2000, rounding: "half-up" },
            priority: 0,
          },
        ],
      },
    });
  });

  it("allows a list with no rules yet and reads decimals, grouped prices and open-ended windows", () => {
    expect(checkPriceListDraft(base([])).ok).toBe(true);
    const fixed = happyHour({ scopeKind: "product", productId: "p1", effectKind: "fixed_price", value: "45.000", start: "", end: "", days: [] });
    const check = checkPriceListDraft(base([fixed, happyHour({ key: "r2", value: "12,5" })]));
    expect(check.ok && check.body.items.map((item) => item.effect)).toEqual([
      { kind: "fixed_price", price: 45000 },
      { kind: "percent_off", rateBp: 1250, rounding: "half-up" },
    ]);
    expect(check.ok && check.body.items[0]).toMatchObject({ timeWindow: null, daysOfWeek: null });
  });

  it("puts each problem on the field and rule at fault", () => {
    const errors = errorsOf(
      base(
        [
          happyHour({ scopeKind: "category", value: "abc", start: "25:00", end: "17:00", from: "31/02/2026", priority: "x", channelKey: "x".repeat(41) }),
          happyHour({ key: "r2", scopeKind: "variant", productId: "p1", value: "", end: "" }),
        ],
        "   ",
      ),
    );
    expect(errors).toMatchObject({
      name: expect.any(String),
      [rulePath(RULE, "target")]: expect.any(String),
      [rulePath(RULE, "value")]: expect.any(String),
      [rulePath(RULE, "time")]: expect.any(String),
      [rulePath(RULE, "from")]: expect.any(String),
      [rulePath(RULE, "priority")]: expect.any(String),
      [rulePath(RULE, "channel")]: expect.any(String),
      [rulePath("r2", "variant")]: expect.any(String),
      [rulePath("r2", "value")]: expect.any(String),
      [rulePath("r2", "time")]: expect.any(String),
    });
  });

  it("asks the domain: a fixed price for a whole category lands on that rule's effect", () => {
    const errors = errorsOf(base([happyHour({ scopeKind: "category", categoryId: "c1", effectKind: "fixed_price", value: "30.000" })]));
    expect(Object.keys(errors)).toEqual([rulePath(RULE, "effect")]);
  });

  it("asks the domain: a window of equal minutes and a backwards date range", () => {
    expect(Object.keys(errorsOf(base([happyHour({ start: "10:00", end: "10:00" })])))).toEqual([rulePath(RULE, "time")]);
    expect(Object.keys(errorsOf(base([happyHour({ from: "08/11/2026", to: "01/11/2026" })])))).toEqual([rulePath(RULE, "to")]);
  });

  it("keeps the stored instant of a date nobody touched", () => {
    const stored = "2026-11-07T10:00:00.000Z";
    const rule = happyHour({ to: "07/11/2026", stored: { validFrom: null, validTo: stored } });
    const check = checkPriceListDraft(base([rule]));
    expect(check.ok && check.body.items[0]?.validTo).toBe(stored);
    const edited = checkPriceListDraft(base([{ ...rule, to: "08/11/2026" }]));
    expect(edited.ok && edited.body.items[0]?.validTo).toBe("2026-11-08T17:00:00.000Z");
  });

  it("refuses more rules than a list holds", () => {
    const rules = Array.from({ length: 501 }, (_, at) => happyHour({ key: `k${at}` }));
    expect(errorsOf(base(rules)).rules).toBeDefined();
  });
});

describe("saying what a rule does", () => {
  const names = { category: () => undefined, product: (id: string) => (id === "p1" ? "Trà đào" : undefined), variant: () => "L", branch: () => "Q1" };
  it("writes weekday runs the way a shop does", () => {
    expect(daysText([1, 2, 3, 4, 5])).toBe("T2–T6");
    expect(daysText([6, 0])).toBe("T7, CN");
    expect(daysText([])).toBe("mọi ngày");
    expect(daysText([0, 1, 2, 3, 4, 5, 6])).toBe("mọi ngày");
  });

  it("summarises a rule in one line", () => {
    expect(describeRule(happyHour(), names)).toBe("Giảm 20% · cả thực đơn · T2–T6, 14:00–17:00 · mọi chi nhánh");
    const fixed = happyHour({ scopeKind: "variant", productId: "p1", variantId: "v1", effectKind: "fixed_price", value: "45.000", branchId: "b1", channelKey: "grab", days: [], start: "", end: "" });
    expect(describeRule(fixed, names)).toContain("Trà đào · L");
    expect(describeRule(fixed, names)).toContain("Q1, kênh grab");
  });
});
