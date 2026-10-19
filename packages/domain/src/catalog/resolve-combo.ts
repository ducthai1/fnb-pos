import { DomainError } from "../errors";
import { type Vnd, addVnd } from "../money";
import { CATALOG_ERROR_CODES } from "./catalog-error-codes";
import type { ComboDefinition, ComboSlot, Product } from "./catalog-types";

export interface ComboSlotSelectionInput {
  readonly slotId: string;
  readonly productId: string;
  readonly variantId: string | null;
}

export interface ResolvedComboComponent {
  readonly slotId: string;
  readonly productId: string;
  readonly variantId: string | null;
  readonly upcharge: Vnd;
}

export interface ResolvedCombo {
  readonly components: readonly ResolvedComboComponent[];
  /** Added to the combo's own price; 0 when every slot keeps its default choice. */
  readonly totalUpcharge: Vnd;
}

interface SlotPick {
  readonly optionIndex: number;
  readonly component: ResolvedComboComponent;
}

/**
 * Checks what was put in each slot of a combo and prices the swaps.
 *
 * A pick must match a slot option on product AND variant: swapping M for L in the
 * drink slot is a different option with its own upcharge, so a "same product,
 * other size" pick is refused rather than charged as the default. The same option
 * may fill a slot more than once (two milk teas in a "2 drinks" combo).
 *
 * Components come back in slot order, then option order, so the same picks in a
 * different order produce an identical combo. Modifiers of each component (sugar,
 * toppings) are validated separately against that component's own product.
 */
export function resolveCombo(
  comboProduct: Product,
  slotSelections: readonly ComboSlotSelectionInput[],
): ResolvedCombo {
  const definition = comboDefinitionOf(comboProduct);
  const picksBySlot = new Map<string, SlotPick[]>();
  for (const selection of slotSelections) {
    const slot = definition.slots.find((candidate) => candidate.id === selection.slotId);
    if (!slot) {
      throw new DomainError(
        CATALOG_ERROR_CODES.unknownComboSlot,
        `slot ${selection.slotId} does not belong to combo ${comboProduct.id}`,
        { productId: comboProduct.id, slotId: selection.slotId },
      );
    }
    const picks = picksBySlot.get(slot.id) ?? [];
    picks.push(pickFromSlot(slot, selection));
    picksBySlot.set(slot.id, picks);
  }

  const components: ResolvedComboComponent[] = [];
  for (const slot of definition.slots) {
    const picks = picksBySlot.get(slot.id) ?? [];
    assertSlotCount(slot, picks.length);
    picks.sort((a, b) => a.optionIndex - b.optionIndex); // stable: equal picks keep their order
    components.push(...picks.map((pick) => pick.component));
  }
  return {
    components,
    totalUpcharge: addVnd(...components.map((component) => component.upcharge)),
  };
}

function comboDefinitionOf(product: Product): ComboDefinition {
  if (product.kind !== "combo") {
    throw new DomainError(CATALOG_ERROR_CODES.notACombo, `product ${product.id} is not a combo`, {
      productId: product.id,
      kind: product.kind,
    });
  }
  if (product.combo === null) {
    throw new DomainError(
      CATALOG_ERROR_CODES.comboDefinitionMissing,
      `combo ${product.id} has no slots configured`,
      { productId: product.id },
    );
  }
  return product.combo;
}

function pickFromSlot(slot: ComboSlot, selection: ComboSlotSelectionInput): SlotPick {
  const optionIndex = slot.options.findIndex(
    (option) =>
      option.productId === selection.productId && option.variantId === selection.variantId,
  );
  const option = slot.options[optionIndex];
  if (!option) {
    throw new DomainError(
      CATALOG_ERROR_CODES.comboOptionNotInSlot,
      `product ${selection.productId} (variant ${selection.variantId}) is not offered in slot ${slot.id}`,
      { slotId: slot.id, productId: selection.productId, variantId: selection.variantId },
    );
  }
  return {
    optionIndex,
    component: {
      slotId: slot.id,
      productId: option.productId,
      variantId: option.variantId,
      upcharge: option.upcharge,
    },
  };
}

function assertSlotCount(slot: ComboSlot, selected: number): void {
  const context = {
    slotId: slot.id,
    minSelect: slot.minSelect,
    maxSelect: slot.maxSelect,
    selected,
  };
  if (selected === 0 && slot.minSelect >= 1) {
    throw new DomainError(
      CATALOG_ERROR_CODES.requiredComboSlotMissing,
      `slot ${slot.id} must be filled`,
      context,
    );
  }
  if (selected < slot.minSelect) {
    throw new DomainError(
      CATALOG_ERROR_CODES.tooFewComboSelections,
      `slot ${slot.id} needs at least ${slot.minSelect}, got ${selected}`,
      context,
    );
  }
  if (selected > slot.maxSelect) {
    throw new DomainError(
      CATALOG_ERROR_CODES.tooManyComboSelections,
      `slot ${slot.id} allows at most ${slot.maxSelect}, got ${selected}`,
      context,
    );
  }
}
