"use client";

import type { ProductSummary } from "../../../lib/api/catalog-api";
import { vi } from "../../../messages/vi";
import { Listbox } from "../../ui/listbox";
import { FieldError, TextField } from "../../ui/text-field";
import { chooseSlotProduct, removeSlotOption, setSlotOption } from "./combo-draft-edits";
import { type DraftErrors, slotOptionPath } from "./draft-error-paths";
import type { DraftSlot, DraftSlotOption } from "./product-draft";
import type { DraftEdit } from "./product-draft-edits";

const T = vi.menu.editor;

/** One product a slot offers: which product, which of its sizes, and what a swap to it costs. */
export function ComboOptionRow({
  slot,
  option,
  index,
  products,
  errors,
  edit,
}: {
  slot: DraftSlot;
  option: DraftSlotOption;
  index: number;
  products: readonly ProductSummary[];
  errors: DraftErrors;
  edit: (change: DraftEdit) => void;
}) {
  const path = (field?: string) => slotOptionPath(slot.id, option.key, field);
  const product = products.find((candidate) => candidate.id === option.productId);
  const sizes = product?.variants ?? [];
  const name = product?.name ?? T.unnamed;
  return (
    <div
      className="bo-row bo-entry bo-combo-option"
      role="group"
      aria-label={T.slotOptionLabel(index + 1)}
      data-error={errors[path()] === undefined ? undefined : true}
    >
      <div className="bo-listbox-field bo-combo-option__product">
        <Listbox
          className="bo-listbox--field"
          label={T.slotProduct}
          value={option.productId}
          choices={[
            { value: "", label: T.slotProductNone },
            ...products.map((each) => ({ value: each.id, label: each.name })),
          ]}
          onChange={(productId) => {
            const chosen = products.find((candidate) => candidate.id === productId);
            edit(
              chooseSlotProduct(slot.id, option.key, productId, chosen?.variants?.[0]?.id ?? null),
            );
          }}
        />
        <FieldError message={errors[path("productId")]} />
      </div>
      {sizes.length > 0 && (
        <div className="bo-listbox-field">
          <Listbox
            className="bo-listbox--field"
            label={T.slotVariant}
            value={option.variantId ?? ""}
            choices={[
              ...(option.variantId === null ? [{ value: "", label: T.slotVariantNone }] : []),
              ...sizes.map((size) => ({ value: size.id, label: size.name })),
            ]}
            onChange={(variantId) =>
              edit(
                setSlotOption(slot.id, option.key, {
                  variantId: variantId === "" ? null : variantId,
                }),
              )
            }
          />
          <FieldError message={errors[path("variantId")]} />
        </div>
      )}
      <TextField
        label={T.upcharge}
        value={option.upcharge}
        inputMode="numeric"
        className="bo-field--narrow"
        onChange={(upcharge) => edit(setSlotOption(slot.id, option.key, { upcharge }))}
        error={errors[path("upcharge")]}
      />
      <button
        type="button"
        className="bo-button"
        aria-label={T.removeSlotOption(name)}
        onClick={() => edit(removeSlotOption(slot.id, option.key))}
      >
        {vi.common.remove}
      </button>
      <FieldError message={errors[path()]} />
    </div>
  );
}
