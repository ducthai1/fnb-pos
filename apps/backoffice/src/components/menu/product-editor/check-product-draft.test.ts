import { describe, expect, it } from "vitest";
import { vi } from "../../../messages/vi";
import { TEA, milkTeaDraft } from "../../../test-support/milk-tea-draft";
import { checkProductDraft } from "./check-product-draft";
import { groupPath, optionPath, productPath, rulePath, variantPath } from "./draft-error-paths";
import type { ProductDraft } from "./product-draft";
import { setGroup, setOption, setRule, setVariant } from "./product-draft-edits";

const E = vi.errors.byCode;
const refusals = (draft: ProductDraft) => {
  const check = checkProductDraft(draft);
  if (check.ok) throw new Error("expected the draft to be refused");
  return check.errors;
};

describe("checking a product before it is saved", () => {
  it("turns the milk tea into the body the API takes, prices and limits as numbers", () => {
    const check = checkProductDraft(milkTeaDraft());
    if (!check.ok) throw new Error(JSON.stringify(check.errors));
    expect(check.body).toMatchObject({ version: 3, basePrice: 35_000, taxRateBp: 800, printCupLabel: true });
    expect(check.body.variants).toEqual([
      { id: TEA.sizeM, name: "M", price: null },
      { id: TEA.sizeL, name: "L", price: 45_000 },
    ]);
    const topping = check.body.modifierGroups[2];
    expect(topping?.variantRules).toEqual({ [TEA.sizeL]: { maxSelect: 5 } });
    expect(topping?.options[0]).toEqual({ id: TEA.pearl, name: "Trân châu đen", priceDelta: 5_000, maxQuantity: 2 });
    // Without repeats a per-option cap is never sent, whatever was typed before.
    expect(check.body.modifierGroups[0]?.options[0]?.maxQuantity).toBeNull();
  });

  it("puts a minimum above the maximum on the group that has it", () => {
    const errors = refusals(setGroup(TEA.ice, { minSelect: "2" })(milkTeaDraft()));
    expect(errors).toEqual({ [groupPath(TEA.ice)]: E.DOMAIN_CATALOG_MIN_SELECT_ABOVE_MAX_SELECT });
  });

  it("puts a size's own limits on that size's rule, not on the group", () => {
    const errors = refusals(setRule(TEA.topping, TEA.sizeL, { minSelect: "6" })(milkTeaDraft()));
    expect(errors).toEqual({ [rulePath(TEA.topping, TEA.sizeL)]: E.DOMAIN_CATALOG_MIN_SELECT_ABOVE_MAX_SELECT });
  });

  it("refuses a maximum of zero, which hiding the group for a size expresses instead", () => {
    const errors = refusals(setGroup(TEA.topping, { maxSelect: "0" })(milkTeaDraft()));
    expect(errors).toEqual({ [groupPath(TEA.topping)]: E.DOMAIN_CATALOG_INVALID_MAX_SELECT });
  });

  it("refuses a required group no order could fill", () => {
    const errors = refusals(setGroup(TEA.sugar, { minSelect: "3", maxSelect: "3" })(milkTeaDraft()));
    expect(errors).toEqual({ [groupPath(TEA.sugar)]: E.DOMAIN_CATALOG_UNSATISFIABLE_MODIFIER_GROUP });
  });

  it("accepts the same minimum once repeats make it reachable", () => {
    const draft = setGroup(TEA.sugar, { minSelect: "3", maxSelect: "3", allowDuplicates: true })(milkTeaDraft());
    expect(checkProductDraft(draft).ok).toBe(true);
  });

  it("puts a bad per-option cap on that option's field", () => {
    const errors = refusals(setOption(TEA.topping, TEA.jelly, { maxQuantity: "0" })(milkTeaDraft()));
    expect(errors).toEqual({
      [optionPath(TEA.topping, TEA.jelly, "maxQuantity")]: E.DOMAIN_CATALOG_INVALID_OPTION_MAX_QUANTITY,
    });
  });

  it("refuses a required group with no options at the group", () => {
    const draft = milkTeaDraft();
    const empty = { ...draft, modifierGroups: draft.modifierGroups.map((g) => (g.id === TEA.ice ? { ...g, options: [] } : g)) };
    expect(refusals(empty)).toEqual({ [groupPath(TEA.ice)]: E.DOMAIN_CATALOG_REQUIRED_GROUP_WITHOUT_OPTIONS });
  });

  it("refuses a size rule no order could fill, unless the size hides the group", () => {
    const unfillable = setRule(TEA.ice, TEA.sizeL, { minSelect: "3", maxSelect: "3" })(milkTeaDraft());
    expect(refusals(unfillable)).toEqual({
      [rulePath(TEA.ice, TEA.sizeL)]: E.DOMAIN_CATALOG_UNSATISFIABLE_MODIFIER_GROUP,
    });
    expect(checkProductDraft(setRule(TEA.ice, TEA.sizeL, { hidden: true })(unfillable)).ok).toBe(true);
  });

  it("asks for a price when neither the product nor a size has one", () => {
    const draft = { ...milkTeaDraft(), basePrice: "" };
    expect(refusals(draft)).toEqual({ [variantPath(TEA.sizeM, "price")]: E.DOMAIN_PRICING_MISSING_BASE_PRICE });
    const noSizes = { ...draft, variants: [], modifierGroups: [] };
    expect(refusals(noSizes)).toEqual({ [productPath("basePrice")]: E.DOMAIN_PRICING_MISSING_BASE_PRICE });
  });

  it("reports every field that cannot be read, each at its own place, before any rule", () => {
    const draft = setOption(TEA.topping, TEA.pudding, { priceDelta: "7,5" })(
      setVariant(TEA.sizeL, { price: "abc" })({ ...milkTeaDraft(), name: " ", taxRate: "120" }),
    );
    expect(refusals(draft)).toEqual({
      [productPath("name")]: vi.menu.editor.nameRequired,
      [productPath("taxRate")]: vi.roles.rateInvalid,
      [variantPath(TEA.sizeL, "price")]: vi.common.amountInvalid,
      [optionPath(TEA.topping, TEA.pudding, "priceDelta")]: vi.common.amountInvalid,
    });
  });

  it("refuses a name longer than the contract stores, at that name", () => {
    const errors = refusals(setOption(TEA.topping, TEA.jelly, { name: "T".repeat(121) })(milkTeaDraft()));
    expect(errors).toEqual({ [optionPath(TEA.topping, TEA.jelly, "name")]: vi.menu.editor.nameTooLong });
  });
});
