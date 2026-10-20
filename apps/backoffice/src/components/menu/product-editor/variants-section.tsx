"use client";

import { Plus } from "lucide-react";
import { vi } from "../../../messages/vi";
import { Icon } from "../../ui/icon";
import { FieldError, TextField } from "../../ui/text-field";
import { type DraftErrors, variantPath } from "./draft-error-paths";
import { EDITOR_SECTIONS } from "./editor-sections";
import type { ProductDraft } from "./product-draft";
import { type DraftEdit, addVariant, removeVariant, setVariant } from "./product-draft-edits";

const T = vi.menu.editor;

export function VariantsSection({
  draft,
  errors,
  edit,
}: {
  draft: ProductDraft;
  errors: DraftErrors;
  edit: (change: DraftEdit) => void;
}) {
  return (
    <fieldset className="bo-card bo-fieldset-card" id={EDITOR_SECTIONS.variants}>
      <legend className="bo-subtitle">{T.variants}</legend>
      <p className="bo-muted">{T.variantsHint}</p>
      {draft.variants.map((variant, index) => (
        <div key={variant.id} className="bo-row bo-entry" role="group" aria-label={T.variantLabel(index + 1)}>
          <TextField
            label={T.variantName}
            value={variant.name}
            onChange={(name) => edit(setVariant(variant.id, { name }))}
            error={errors[variantPath(variant.id, "name")]}
          />
          <TextField
            label={T.variantPrice}
            value={variant.price}
            inputMode="numeric"
            onChange={(price) => edit(setVariant(variant.id, { price }))}
            error={errors[variantPath(variant.id, "price")]}
          />
          <button
            type="button"
            className="bo-button"
            aria-label={T.removeVariant(variant.name || T.unnamed)}
            onClick={() => edit(removeVariant(variant.id))}
          >
            {vi.common.remove}
          </button>
          <FieldError message={errors[variantPath(variant.id)]} />
        </div>
      ))}
      <button type="button" className="bo-button bo-button--add" onClick={() => edit(addVariant())}>
        <Icon of={Plus} size={16} />
        {T.addVariant}
      </button>
    </fieldset>
  );
}
