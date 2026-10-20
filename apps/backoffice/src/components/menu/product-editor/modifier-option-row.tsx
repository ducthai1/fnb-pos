"use client";

import { vi } from "../../../messages/vi";
import { FieldError, TextField } from "../../ui/text-field";
import { type DraftErrors, optionPath } from "./draft-error-paths";
import type { DraftGroup, DraftOption } from "./product-draft";
import { type DraftEdit, removeOption, setOption } from "./product-draft-edits";

const T = vi.menu.editor;

/** One option of a group; its own refusals show on its row. */
export function ModifierOptionRow({
  group,
  option,
  index,
  errors,
  edit,
}: {
  group: DraftGroup;
  option: DraftOption;
  index: number;
  errors: DraftErrors;
  edit: (change: DraftEdit) => void;
}) {
  const path = (field?: string) => optionPath(group.id, option.id, field);
  const set = (patch: Partial<Omit<DraftOption, "id">>) => edit(setOption(group.id, option.id, patch));
  return (
    <div className="bo-row bo-entry" role="group" aria-label={T.optionLabel(index + 1)} data-error={errors[path()] === undefined ? undefined : true}>
      <TextField label={T.optionName} value={option.name} onChange={(name) => set({ name })} error={errors[path("name")]} />
      <TextField
        label={T.priceDelta}
        value={option.priceDelta}
        inputMode="numeric"
        onChange={(priceDelta) => set({ priceDelta })}
        error={errors[path("priceDelta")]}
      />
      {/* Without repeats every option is taken at most once, so a cap per option means nothing. */}
      {group.allowDuplicates && (
        <TextField
          label={T.maxQuantity}
          value={option.maxQuantity}
          inputMode="numeric"
          onChange={(maxQuantity) => set({ maxQuantity })}
          error={errors[path("maxQuantity")]}
        />
      )}
      <button
        type="button"
        className="bo-button"
        aria-label={T.removeOption(option.name || T.unnamed)}
        onClick={() => edit(removeOption(group.id, option.id))}
      >
        {vi.common.remove}
      </button>
      <FieldError message={errors[path()]} />
    </div>
  );
}
