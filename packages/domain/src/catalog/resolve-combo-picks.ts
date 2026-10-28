import { DomainError } from "../errors";
import type { Vnd } from "../money";
import { CATALOG_ERROR_CODES } from "./catalog-error-codes";
import type { Product } from "./catalog-types";
import { findProductVariant } from "./find-product-variant";
import { type ComboSlotSelectionInput, resolveCombo } from "./resolve-combo";
import {
  type ModifierSelectionInput,
  type ValidatedModifierSelection,
  validateModifierSelection,
} from "./validate-modifier-selection";

/** What was put in one place of a combo: a product of the slot, with its own options. */
export interface ComboPickInput extends ComboSlotSelectionInput {
  /** The component's own options (sugar, ice), checked against the component's product. */
  readonly modifiers: readonly ModifierSelectionInput[];
}

export interface ResolvedComboPick {
  readonly slotId: string;
  readonly product: Product;
  readonly variantId: string | null;
  /** What the slot charges for this choice, on top of the combo's own price. */
  readonly upcharge: Vnd;
  /** The component as an order line names it: the product, with its size when it has one. */
  readonly name: string;
  readonly modifiers: readonly ValidatedModifierSelection[];
}

/**
 * A combo's picks checked against its slots (resolveCombo) and each pick's options against
 * the picked product's own groups, as the lines the order stores under the combo: slot order,
 * then option order, so the same picks in another order make the same lines.
 *
 * A pick must be a product the menu still sells (`productOf` finds it) and never a combo: an
 * order line holds a combo's components under it, and a component cannot hold components.
 */
export function resolveComboPicks(
  comboProduct: Product,
  productOf: (productId: string) => Product | undefined,
  picks: readonly ComboPickInput[],
): ResolvedComboPick[] {
  const resolved = resolveCombo(comboProduct, picks);
  const slots = comboProduct.combo?.slots ?? [];
  const rank = (pick: ComboPickInput) => {
    const slotIndex = slots.findIndex((slot) => slot.id === pick.slotId);
    const optionIndex = (slots[slotIndex]?.options ?? []).findIndex(
      (option) => option.productId === pick.productId && option.variantId === pick.variantId,
    );
    return [slotIndex, optionIndex] as const;
  };
  // The order resolveCombo returns its components in; sort is stable, so equal picks keep theirs.
  const ordered = picks
    .map((pick) => ({ pick, rank: rank(pick) }))
    .sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1]);
  return resolved.components.map((component, index) => {
    const pick = ordered[index]?.pick;
    if (pick === undefined) throw new Error("resolveCombo returned a component per pick");
    const product = componentProduct(comboProduct, productOf, component.productId);
    const variant = findProductVariant(product, component.variantId);
    return {
      slotId: component.slotId,
      product,
      variantId: component.variantId,
      upcharge: component.upcharge,
      name: variant === null ? product.name : `${product.name} (${variant.name})`,
      modifiers: validateModifierSelection(product, component.variantId, pick.modifiers),
    };
  });
}

function componentProduct(
  comboProduct: Product,
  productOf: (productId: string) => Product | undefined,
  productId: string,
): Product {
  const product = productOf(productId);
  const context = { productId: comboProduct.id, componentProductId: productId };
  if (product === undefined) {
    throw new DomainError(
      CATALOG_ERROR_CODES.comboComponentNotFound,
      `combo ${comboProduct.id} offers product ${productId}, which is no longer sold`,
      context,
    );
  }
  if (product.kind === "combo") {
    throw new DomainError(
      CATALOG_ERROR_CODES.comboInCombo,
      `combo ${comboProduct.id} offers combo ${productId} as a component`,
      context,
    );
  }
  return product;
}
