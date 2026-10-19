import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isDomainError } from "../errors";
import { vnd } from "../money";
import { CATALOG_ERROR_CODES } from "./catalog-error-codes";
import type { ModifierGroup, Product } from "./catalog-types";
import { validateModifierGroupConfig } from "./validate-modifier-group-config";
import {
  type ModifierSelectionInput,
  validateModifierSelection,
} from "./validate-modifier-selection";

// Groups whose limits are well-formed, so only reachability decides whether they pass.
const groupArbitrary: fc.Arbitrary<ModifierGroup> = fc
  .record({
    minSelect: fc.integer({ min: 0, max: 6 }),
    extra: fc.integer({ min: 0, max: 3 }),
    allowDuplicates: fc.boolean(),
    caps: fc.array(fc.option(fc.integer({ min: 1, max: 3 }), { nil: null }), { maxLength: 4 }),
  })
  .map(({ minSelect, extra, allowDuplicates, caps }) => ({
    id: "group",
    name: "Nhóm",
    minSelect,
    maxSelect: Math.max(1, minSelect + extra),
    allowDuplicates,
    options: caps.map((maxQuantity, index) => ({
      id: `option-${index}`,
      name: `Lựa chọn ${index}`,
      priceDelta: vnd(1_000),
      maxQuantity,
    })),
    variantRules: {},
  }));

/** Fills options in order, each up to what it may carry: the largest selection possible. */
function greedySelection(group: ModifierGroup, wanted: number): ModifierSelectionInput[] {
  const selection: ModifierSelectionInput[] = [];
  let remaining = wanted;
  for (const option of group.options) {
    if (remaining === 0) break;
    const cap = group.allowDuplicates ? (option.maxQuantity ?? remaining) : 1;
    const quantity = Math.min(cap, remaining);
    selection.push({ groupId: group.id, optionId: option.id, quantity });
    remaining -= quantity;
  }
  return remaining === 0 ? selection : [];
}

const productWith = (group: ModifierGroup): Product => ({
  id: "product",
  categoryId: null,
  kind: "prepared_drink",
  name: "Món",
  basePrice: vnd(30_000),
  pricingMode: "fixed",
  variants: [],
  modifierGroups: [group],
  combo: null,
});

describe("modifier group reachability", () => {
  it("accepts a group exactly when some selection meets its minimum, and that selection sells", () => {
    fc.assert(
      fc.property(groupArbitrary, (group) => {
        let accepted = true;
        try {
          validateModifierGroupConfig(group);
        } catch (error) {
          if (!isDomainError(error)) throw error;
          expect([
            CATALOG_ERROR_CODES.unsatisfiableModifierGroup,
            CATALOG_ERROR_CODES.requiredGroupWithoutOptions,
          ]).toContain(error.code);
          accepted = false;
        }
        const selection = greedySelection(group, group.minSelect);
        const reachable = group.minSelect === 0 || selection.length > 0;
        expect(accepted).toBe(reachable);
        if (accepted) {
          expect(() =>
            validateModifierSelection(productWith(group), null, selection),
          ).not.toThrow();
        }
      }),
    );
  });
});
