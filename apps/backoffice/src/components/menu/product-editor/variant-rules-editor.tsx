"use client";

import { vi } from "../../../messages/vi";
import { CheckField } from "../../ui/select-field";
import { FieldError, TextField } from "../../ui/text-field";
import { type DraftErrors, rulePath } from "./draft-error-paths";
import type { DraftGroup, DraftVariant } from "./product-draft";
import { type DraftEdit, ruleOf, setRule } from "./product-draft-edits";

const T = vi.menu.editor;

/**
 * How the group applies to each size: hidden, or with its own limits ("size L: up to 5
 * toppings"). Blank limits inherit the group's, as the domain reads a rule.
 */
export function VariantRulesEditor({
  group,
  variants,
  errors,
  edit,
}: {
  group: DraftGroup;
  variants: readonly DraftVariant[];
  errors: DraftErrors;
  edit: (change: DraftEdit) => void;
}) {
  if (variants.length === 0) return null;
  return (
    <fieldset className="bo-fieldset">
      <legend>{T.rules}</legend>
      <p className="bo-muted">{T.rulesHint}</p>
      {variants.map((variant) => {
        const rule = ruleOf(group, variant.id);
        const path = (field?: string) => rulePath(group.id, variant.id, field);
        const set = (patch: Parameters<typeof setRule>[2]) => edit(setRule(group.id, variant.id, patch));
        return (
          <div key={variant.id} className="bo-row bo-entry" role="group" aria-label={T.ruleLabel(variant.name || T.unnamed)}>
            <CheckField label={T.ruleHidden} checked={rule.hidden} onChange={(hidden) => set({ hidden })} />
            {!rule.hidden && (
              <>
                <TextField
                  label={T.ruleMin}
                  value={rule.minSelect}
                  inputMode="numeric"
                  placeholder={group.minSelect}
                  onChange={(minSelect) => set({ minSelect })}
                  error={errors[path("minSelect")]}
                />
                <TextField
                  label={T.ruleMax}
                  value={rule.maxSelect}
                  inputMode="numeric"
                  placeholder={group.maxSelect}
                  onChange={(maxSelect) => set({ maxSelect })}
                  error={errors[path("maxSelect")]}
                />
              </>
            )}
            <FieldError message={errors[path()]} />
          </div>
        );
      })}
    </fieldset>
  );
}
