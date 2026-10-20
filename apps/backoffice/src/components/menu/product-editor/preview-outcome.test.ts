import { CATALOG_ERROR_CODES, type Product } from "@fnb/domain";
import { describe, expect, it } from "vitest";
import { vi } from "../../../messages/vi";
import { BRANCHES } from "../../../test-support/fake-backoffice-api";
import { TEA, milkTeaDraft } from "../../../test-support/milk-tea-draft";
import { checkProductDraft } from "./check-product-draft";
import { setRule } from "./product-draft-edits";
import { type PreviewCounts, countKey, previewMessage, previewOutcome } from "./preview-outcome";

const T = vi.menu.preview;
const AT = Date.UTC(2026, 9, 20, 3, 0);

function tea(draft = milkTeaDraft()): Product {
  const check = checkProductDraft(draft);
  if (!check.ok) throw new Error(JSON.stringify(check.errors));
  return check.product;
}

const base: PreviewCounts = {
  [countKey(TEA.sugar, TEA.sugarHalf)]: 1,
  [countKey(TEA.ice, TEA.iceNone)]: 1,
};
const preview = (variantId: string, counts: PreviewCounts, product = tea()) =>
  previewOutcome(product, variantId, counts, BRANCHES[0]!.id, AT);

describe("what the preview makes of a customer's choices", () => {
  it("prices an L with two pearls and a pudding as the till would", () => {
    const outcome = preview(TEA.sizeL, { ...base, [countKey(TEA.topping, TEA.pearl)]: 2, [countKey(TEA.topping, TEA.pudding)]: 1 });
    // 45.000 + 2 × 5.000 + 7.000
    expect(outcome).toEqual({ ok: true, unitPrice: 62_000n, extras: 17_000n });
  });

  it("allows five toppings on an L and refuses a sixth, on the topping group", () => {
    const five = { ...base, [countKey(TEA.topping, TEA.jelly)]: 3, [countKey(TEA.topping, TEA.pudding)]: 2 };
    expect(preview(TEA.sizeL, five).ok).toBe(true);
    const six = preview(TEA.sizeL, { ...five, [countKey(TEA.topping, TEA.pearl)]: 1 });
    if (six.ok) throw new Error("six toppings were accepted");
    expect(six.error.code).toBe(CATALOG_ERROR_CODES.tooManyModifierSelections);
    expect(six.error.details?.groupId).toBe(TEA.topping);
    expect(previewMessage(six.error)).toBe(T.tooMany(5, 6));
  });

  it("holds an M to the group's own three toppings", () => {
    const four = preview(TEA.sizeM, { ...base, [countKey(TEA.topping, TEA.jelly)]: 4 });
    if (four.ok) throw new Error("four toppings on an M were accepted");
    expect(previewMessage(four.error)).toBe(T.tooMany(3, 4));
  });

  it("refuses a third portion of pearls, capped at two", () => {
    const outcome = preview(TEA.sizeL, { ...base, [countKey(TEA.topping, TEA.pearl)]: 3 });
    if (outcome.ok) throw new Error("three pearls were accepted");
    expect(previewMessage(outcome.error)).toBe(T.optionMax(2));
  });

  it("asks for the required sugar level", () => {
    const outcome = preview(TEA.sizeM, { [countKey(TEA.ice, TEA.iceNone)]: 1 });
    if (outcome.ok) throw new Error("a tea without sugar level was accepted");
    expect(outcome.error.details?.groupId).toBe(TEA.sugar);
    expect(previewMessage(outcome.error)).toBe(T.requiredMissing(1));
  });

  it("leaves out a group the size hides, choices in it included", () => {
    const product = tea(setRule(TEA.ice, TEA.sizeL, { hidden: true })(milkTeaDraft()));
    const outcome = preview(TEA.sizeL, { [countKey(TEA.sugar, TEA.sugarFull)]: 1, [countKey(TEA.ice, TEA.iceNone)]: 1 }, product);
    expect(outcome).toEqual({ ok: true, unitPrice: 45_000n, extras: 0n });
    // The same choices on the M, where ice applies and is fine; without ice the M is refused.
    expect(preview(TEA.sizeM, { [countKey(TEA.sugar, TEA.sugarFull)]: 1 }, product).ok).toBe(false);
  });
});
