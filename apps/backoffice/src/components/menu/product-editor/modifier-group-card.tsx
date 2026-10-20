"use client";

import { vi } from "../../../messages/vi";
import { CheckField } from "../../ui/select-field";
import { FieldError, TextField } from "../../ui/text-field";
import { type DraftErrors, groupPath } from "./draft-error-paths";
import { ModifierOptionRow } from "./modifier-option-row";
import type { DraftGroup, DraftVariant } from "./product-draft";
import { type DraftEdit, addOption, removeGroup, setGroup } from "./product-draft-edits";
import { VariantRulesEditor } from "./variant-rules-editor";

const T = vi.menu.editor;

/** One modifier group: its limits, its options and how it applies to each size. */
export function ModifierGroupCard({
  group,
  index,
  variants,
  errors,
  edit,
}: {
  group: DraftGroup;
  index: number;
  variants: readonly DraftVariant[];
  errors: DraftErrors;
  edit: (change: DraftEdit) => void;
}) {
  const set = (patch: Parameters<typeof setGroup>[1]) => edit(setGroup(group.id, patch));
  const groupError = errors[groupPath(group.id)];
  return (
    <section
      className="bo-card bo-group-card"
      aria-label={T.groupLabel(index + 1)}
      data-error={groupError === undefined ? undefined : true}
    >
      <FieldError message={groupError} />
      <div className="bo-row">
        <TextField
          label={T.groupName}
          value={group.name}
          onChange={(name) => set({ name })}
          error={errors[groupPath(group.id, "name")]}
        />
        <TextField
          label={T.minSelect}
          value={group.minSelect}
          inputMode="numeric"
          className="bo-field--narrow"
          onChange={(minSelect) => set({ minSelect })}
          error={errors[groupPath(group.id, "minSelect")]}
        />
        <TextField
          label={T.maxSelect}
          value={group.maxSelect}
          inputMode="numeric"
          className="bo-field--narrow"
          onChange={(maxSelect) => set({ maxSelect })}
          error={errors[groupPath(group.id, "maxSelect")]}
        />
      </div>
      <CheckField
        label={T.allowDuplicates}
        checked={group.allowDuplicates}
        onChange={(allowDuplicates) => set({ allowDuplicates })}
      />
      <fieldset className="bo-fieldset">
        <legend>{T.options}</legend>
        {group.options.map((option, optionIndex) => (
          <ModifierOptionRow
            key={option.id}
            group={group}
            option={option}
            index={optionIndex}
            errors={errors}
            edit={edit}
          />
        ))}
        <button type="button" className="bo-button" onClick={() => edit(addOption(group.id))}>
          {T.addOption}
        </button>
      </fieldset>
      <VariantRulesEditor group={group} variants={variants} errors={errors} edit={edit} />
      <button
        type="button"
        className="bo-button bo-button--danger"
        aria-label={T.removeGroup(group.name || T.unnamed)}
        onClick={() => edit(removeGroup(group.id))}
      >
        {vi.common.remove}
      </button>
    </section>
  );
}
