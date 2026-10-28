"use client";

import { Plus, Trash2 } from "lucide-react";
import type { ProductSummary } from "../../../lib/api/catalog-api";
import { vi } from "../../../messages/vi";
import { Icon } from "../../ui/icon";
import { FieldError, TextField } from "../../ui/text-field";
import { ComboOptionRow } from "./combo-option-row";
import { addSlot, addSlotOption, removeSlot, setSlot } from "./combo-draft-edits";
import { type DraftErrors, slotPath } from "./draft-error-paths";
import { EDITOR_SECTIONS } from "./editor-sections";
import type { DraftSlot, ProductDraft } from "./product-draft";
import type { DraftEdit } from "./product-draft-edits";

const T = vi.menu.editor;

/**
 * The products a combo can offer: the brand's own, never a combo (a pick cannot hold picks)
 * nor the product itself. One taken off the menu is offered only to the row that already
 * names it, so the row does not turn blank.
 */
export function comboChoices(
  draft: ProductDraft,
  products: readonly ProductSummary[],
): ProductSummary[] {
  const named = new Set(draft.combo?.slots.flatMap((slot) => slot.options.map((o) => o.productId)));
  return products.filter(
    (product) =>
      product.id !== draft.id &&
      product.kind !== "combo" &&
      (product.archivedAt === null || named.has(product.id)),
  );
}

/** A combo's slots, each a card like a modifier group, with the products it offers. */
export function ComboSection({
  draft,
  products,
  errors,
  edit,
}: {
  draft: ProductDraft;
  products: readonly ProductSummary[];
  errors: DraftErrors;
  edit: (change: DraftEdit) => void;
}) {
  const choices = comboChoices(draft, products);
  return (
    <fieldset className="bo-card bo-fieldset-card" id={EDITOR_SECTIONS.combo}>
      <legend className="bo-subtitle">{T.comboSlots}</legend>
      <p className="bo-muted">{T.comboSlotsHint}</p>
      {choices.length === 0 && <p className="bo-notice bo-notice--warn">{T.noComboProducts}</p>}
      {(draft.combo?.slots ?? []).map((slot, index) => (
        <ComboSlotCard
          key={slot.id}
          slot={slot}
          index={index}
          products={choices}
          errors={errors}
          edit={edit}
        />
      ))}
      <button type="button" className="bo-button bo-button--add" onClick={() => edit(addSlot())}>
        <Icon of={Plus} size={16} />
        {T.addSlot}
      </button>
    </fieldset>
  );
}

function ComboSlotCard({
  slot,
  index,
  products,
  errors,
  edit,
}: {
  slot: DraftSlot;
  index: number;
  products: readonly ProductSummary[];
  errors: DraftErrors;
  edit: (change: DraftEdit) => void;
}) {
  const set = (patch: Parameters<typeof setSlot>[1]) => edit(setSlot(slot.id, patch));
  const slotError = errors[slotPath(slot.id)];
  return (
    <section
      className="bo-card bo-group-card"
      aria-label={T.slotLabel(index + 1)}
      data-error={slotError === undefined ? undefined : true}
    >
      <FieldError message={slotError} />
      <div className="bo-row">
        <TextField
          label={T.slotName}
          value={slot.name}
          onChange={(name) => set({ name })}
          error={errors[slotPath(slot.id, "name")]}
        />
        <TextField
          label={T.slotMin}
          value={slot.minSelect}
          inputMode="numeric"
          className="bo-field--narrow"
          onChange={(minSelect) => set({ minSelect })}
          error={errors[slotPath(slot.id, "minSelect")]}
        />
        <TextField
          label={T.slotMax}
          value={slot.maxSelect}
          inputMode="numeric"
          className="bo-field--narrow"
          onChange={(maxSelect) => set({ maxSelect })}
          error={errors[slotPath(slot.id, "maxSelect")]}
        />
      </div>
      <fieldset className="bo-fieldset">
        <legend>{T.slotOptions}</legend>
        {slot.options.map((option, optionIndex) => (
          <ComboOptionRow
            key={option.key}
            slot={slot}
            option={option}
            index={optionIndex}
            products={products}
            errors={errors}
            edit={edit}
          />
        ))}
        <button
          type="button"
          className="bo-button bo-button--add"
          onClick={() => edit(addSlotOption(slot.id))}
        >
          <Icon of={Plus} size={16} />
          {T.addSlotOption}
        </button>
      </fieldset>
      <button
        type="button"
        className="bo-button bo-button--danger bo-button--sm bo-group-card__remove"
        aria-label={T.removeSlot(slot.name || T.unnamed)}
        onClick={() => edit(removeSlot(slot.id))}
      >
        <Icon of={Trash2} size={16} />
        {vi.common.remove}
      </button>
    </section>
  );
}
