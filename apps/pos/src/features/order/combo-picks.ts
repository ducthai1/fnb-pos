import type { PosProduct } from "@fnb/contracts";
import {
  type ComboPickInput,
  type ComboSlot,
  type ComboSlotOption,
  type ModifierSelectionInput,
  type OrderLine,
  QUANTITY_SCALE,
} from "@fnb/domain";
import type { TillMenu } from "../menu/till-menu";

/** A pick as the picker holds it: `key` tells two equal picks of one slot apart on screen. */
export interface PickerPick extends ComboPickInput {
  readonly key: string;
}

export const optionKey = (option: Pick<ComboSlotOption, "productId" | "variantId">) =>
  `${option.productId}:${option.variantId ?? ""}`;

/** The slots of a combo; empty for a product that is no combo. */
export const slotsOf = (product: PosProduct): readonly ComboSlot[] => product.combo?.slots ?? [];

/** The options of a slot the till can sell: their product is still on its menu. */
export function offeredOptions(menu: TillMenu, slot: ComboSlot): ComboSlotOption[] {
  return slot.options.filter((option) => {
    const product = menu.productsById.get(option.productId);
    return product !== undefined && product.kind !== "combo";
  });
}

/** Whether the counter can sell a combo: it has slots, and each required one an option. */
export function comboSellable(menu: TillMenu, product: PosProduct): boolean {
  const slots = slotsOf(product);
  if (product.kind !== "combo" || slots.length === 0) return false;
  return slots.every((slot) => slot.minSelect === 0 || offeredOptions(menu, slot).length > 0);
}

/** The name of an option as the picker and the cart show it: product, then size. */
export function optionName(
  menu: TillMenu,
  option: Pick<ComboSlotOption, "productId" | "variantId">,
): string {
  const product = menu.productsById.get(option.productId);
  if (product === undefined) return "";
  const variant = product.variants.find((candidate) => candidate.id === option.variantId);
  return variant === undefined ? product.name : `${product.name} (${variant.name})`;
}

let keys = 0;
const nextKey = () => `pick-${++keys}`;

const pickOf = (slot: ComboSlot, option: ComboSlotOption): PickerPick => ({
  key: nextKey(),
  slotId: slot.id,
  productId: option.productId,
  variantId: option.variantId,
  modifiers: [],
});

/**
 * Where the picker starts: a required slot with a single option on offer is filled with it
 * (there is nothing to choose), every other slot is left for the cashier. Nothing is ever
 * picked for the customer when there is a choice: a wrong drink made by default costs more
 * than a tap.
 */
export function initialPicks(
  menu: TillMenu,
  product: PosProduct,
  available: (option: ComboSlotOption) => boolean,
): PickerPick[] {
  return slotsOf(product).flatMap((slot) => {
    const offered = offeredOptions(menu, slot).filter(available);
    const only = offered[0];
    if (slot.minSelect === 0 || offered.length !== 1 || only === undefined) return [];
    return Array.from({ length: slot.minSelect }, () => pickOf(slot, only));
  });
}

export const picksIn = (picks: readonly PickerPick[], slotId: string) =>
  picks.filter((pick) => pick.slotId === slotId);

/**
 * A tap on an option of a slot. A slot of one takes the option in place of what it had;
 * a slot of several adds one more of it, up to the slot's limit (null: already full).
 */
export function tapComboOption(
  picks: readonly PickerPick[],
  slot: ComboSlot,
  option: ComboSlotOption,
): PickerPick[] | null {
  const inSlot = picksIn(picks, slot.id);
  if (slot.maxSelect === 1) {
    const current = inSlot[0];
    if (current !== undefined && optionKey(current) === optionKey(option)) return [...picks];
    return [...picks.filter((pick) => pick.slotId !== slot.id), pickOf(slot, option)];
  }
  if (inSlot.length >= slot.maxSelect) return null;
  return [...picks, pickOf(slot, option)];
}

/** One fewer of an option in a slot: the last one taken goes. */
export function dropComboOption(
  picks: readonly PickerPick[],
  slot: ComboSlot,
  option: ComboSlotOption,
): PickerPick[] {
  let last = -1;
  picks.forEach((pick, index) => {
    if (pick.slotId === slot.id && optionKey(pick) === optionKey(option)) last = index;
  });
  return picks.filter((_, index) => index !== last);
}

export function setPickModifiers(
  picks: readonly PickerPick[],
  key: string,
  modifiers: readonly ModifierSelectionInput[],
): PickerPick[] {
  return picks.map((pick) => (pick.key === key ? { ...pick, modifiers } : pick));
}

/** The picks as a cart line carries them, without the picker's keys. */
export const cartPicks = (picks: readonly PickerPick[]): ComboPickInput[] =>
  picks.map(({ slotId, productId, variantId, modifiers }) => ({
    slotId,
    productId,
    variantId,
    modifiers,
  }));

type StoredPick = { readonly line: OrderLine; readonly modifiers: ModifierSelectionInput[] };

/**
 * Which slot each stored pick of a combo filled. The order keeps picks in slot order, then
 * option order, so the slots are found by cutting the picks into consecutive runs, one per
 * slot in order, each run within its slot's limits and its options. A product offered in two
 * slots is told apart by the upcharge it was sold at; when the menu changed it so no cut
 * fits, the price is left out of it. No cut at all (the slot is gone): the picks go back
 * without a slot, and the line cannot be priced until it is chosen again.
 */
export function assignStoredPicks(
  slots: readonly ComboSlot[],
  stored: readonly StoredPick[],
): ComboPickInput[] {
  const fits = (slot: ComboSlot, pick: StoredPick, byPrice: boolean) =>
    slot.options.findIndex(
      (option) =>
        option.productId === pick.line.productId &&
        option.variantId === pick.line.variantId &&
        (!byPrice || option.upcharge === pick.line.unitPrice),
    );
  const cut = (slotIndex: number, from: number, byPrice: boolean): string[] | null => {
    const slot = slots[slotIndex];
    if (slot === undefined) return from === stored.length ? [] : null;
    let lastOption = -1;
    const runs: number[] = [0];
    for (let end = from; end < stored.length; end += 1) {
      const pick = stored[end];
      const option = pick === undefined ? -1 : fits(slot, pick, byPrice);
      if (option === -1 || option < lastOption) break;
      lastOption = option;
      runs.push(end - from + 1);
    }
    for (const length of runs.reverse()) {
      if (length < slot.minSelect || length > slot.maxSelect) continue;
      const rest = cut(slotIndex + 1, from + length, byPrice);
      if (rest !== null) return [...Array<string>(length).fill(slot.id), ...rest];
    }
    return null;
  };
  const slotIds = cut(0, 0, true) ?? cut(0, 0, false);
  return stored.map((pick, index) => ({
    slotId: slotIds?.[index] ?? "",
    productId: pick.line.productId ?? "",
    variantId: pick.line.variantId,
    modifiers: pick.modifiers,
  }));
}

/** The option of a pick's product that a stored option line picked, with its group. */
function modifierOfPick(menu: TillMenu, pick: OrderLine, line: OrderLine): ModifierSelectionInput {
  const product = pick.productId === null ? undefined : menu.productsById.get(pick.productId);
  const group = product?.modifierGroups.find((candidate) =>
    candidate.options.some((option) => option.id === line.modifierOptionId),
  );
  return {
    groupId: group?.id ?? "",
    optionId: line.modifierOptionId ?? "",
    quantity: Number(line.quantity / QUANTITY_SCALE),
  };
}

/** A stored combo's picks as its cart line carries them again, slots found from the menu. */
export function storedComboPicks(
  menu: TillMenu,
  item: OrderLine,
  tree: readonly OrderLine[],
): ComboPickInput[] | undefined {
  const picks = tree.filter(
    (line) => line.parentLineId === item.id && line.lineType === "combo_component",
  );
  const product = item.productId === null ? undefined : menu.productsById.get(item.productId);
  if (picks.length === 0 && product?.kind !== "combo") return undefined;
  const stored = picks.map((line) => ({
    line,
    modifiers: tree
      .filter((option) => option.parentLineId === line.id && option.lineType === "modifier")
      .map((option) => modifierOfPick(menu, line, option)),
  }));
  return assignStoredPicks(product === undefined ? [] : slotsOf(product), stored);
}
