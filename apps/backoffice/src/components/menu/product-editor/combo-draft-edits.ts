import type { ProductBody } from "../../../lib/catalog/product-document";
import { type DraftCombo, type DraftSlot, type DraftSlotOption, newId } from "./product-draft";
import type { DraftEdit } from "./product-draft-edits";

/*
 * The changes the editor makes to a combo's slots, as functions from the old draft to the
 * new one, like the rest of the editor's edits.
 */

const newSlotOption = (): DraftSlotOption => ({
  key: newId(),
  productId: "",
  variantId: null,
  upcharge: "0",
});

/** A slot starts as "pick one, required", with one row to choose its first product in. */
const newSlot = (): DraftSlot => ({
  id: newId(),
  name: "",
  minSelect: "1",
  maxSelect: "1",
  options: [newSlotOption()],
});

const mapCombo =
  (change: (combo: DraftCombo) => DraftCombo): DraftEdit =>
  (draft) =>
    draft.combo === null ? draft : { ...draft, combo: change(draft.combo) };

const mapSlot = (slotId: string, change: (slot: DraftSlot) => DraftSlot): DraftEdit =>
  mapCombo((combo) => ({
    slots: combo.slots.map((slot) => (slot.id === slotId ? change(slot) : slot)),
  }));

/**
 * The product's kind. A combo sells at a fixed price and starts with one slot; any other
 * kind carries no slots, which the domain would refuse on it.
 */
export const setKind =
  (kind: ProductBody["kind"]): DraftEdit =>
  (draft) =>
    kind === "combo"
      ? { ...draft, kind, pricingMode: "fixed", combo: draft.combo ?? { slots: [newSlot()] } }
      : { ...draft, kind, combo: null };

export const addSlot = (): DraftEdit =>
  mapCombo((combo) => ({ slots: [...combo.slots, newSlot()] }));

export const setSlot = (
  slotId: string,
  patch: Partial<Pick<DraftSlot, "name" | "minSelect" | "maxSelect">>,
): DraftEdit => mapSlot(slotId, (slot) => ({ ...slot, ...patch }));

export const removeSlot = (slotId: string): DraftEdit =>
  mapCombo((combo) => ({ slots: combo.slots.filter((slot) => slot.id !== slotId) }));

export const addSlotOption = (slotId: string): DraftEdit =>
  mapSlot(slotId, (slot) => ({ ...slot, options: [...slot.options, newSlotOption()] }));

export const setSlotOption = (
  slotId: string,
  key: string,
  patch: Partial<Omit<DraftSlotOption, "key">>,
): DraftEdit =>
  mapSlot(slotId, (slot) => ({
    ...slot,
    options: slot.options.map((option) => (option.key === key ? { ...option, ...patch } : option)),
  }));

/** A row given another product takes that product's first size (or none, sold in one form). */
export const chooseSlotProduct = (
  slotId: string,
  key: string,
  productId: string,
  firstVariantId: string | null,
): DraftEdit => setSlotOption(slotId, key, { productId, variantId: firstVariantId });

export const removeSlotOption = (slotId: string, key: string): DraftEdit =>
  mapSlot(slotId, (slot) => ({
    ...slot,
    options: slot.options.filter((option) => option.key !== key),
  }));
