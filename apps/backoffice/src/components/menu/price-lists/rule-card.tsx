"use client";

import { Trash2 } from "lucide-react";
import { useMemo } from "react";
import { type DraftErrors, rulePath } from "../../../lib/catalog/price-list/check-price-list-draft";
import { describeRule } from "../../../lib/catalog/price-list/describe-rule";
import type { RuleDraft } from "../../../lib/catalog/price-list/price-list-draft";
import { vi } from "../../../messages/vi";
import { Icon } from "../../ui/icon";
import { FieldError } from "../../ui/text-field";
import { RuleWhatFields, RuleWhenFields, type RuleChoices, type RuleEdit } from "./rule-fields";

const T = vi.priceLists.editor;

/** One rule: a head that says in one line what it does, then its fields. */
export function RuleCard({
  rule,
  number,
  choices,
  errors,
  edit,
  remove,
}: {
  rule: RuleDraft;
  number: number;
  choices: RuleChoices;
  errors: DraftErrors;
  edit: RuleEdit;
  remove: () => void;
}) {
  const names = useMemo(() => {
    const variants = new Map(choices.products.flatMap((p) => (p.variants ?? []).map((v) => [v.id, v.name] as const)));
    return {
      category: (id: string) => choices.categories.find((c) => c.id === id)?.name,
      product: (id: string) => choices.products.find((p) => p.id === id)?.name,
      variant: (id: string) => variants.get(id),
      branch: (id: string) => choices.branches.find((b) => b.id === id)?.name,
    };
  }, [choices]);
  const failed = Object.keys(errors).some((path) => path.startsWith(`rule.${rule.key}.`));
  return (
    <li className="bo-card bo-rule-card" data-error={failed ? "true" : undefined} aria-label={T.ruleTitle(number)}>
      <div className="bo-rule-card__head">
        <div className="bo-grow">
          <h3 className="bo-subtitle">{T.ruleTitle(number)}</h3>
          <p className="bo-muted bo-wrap">{describeRule(rule, names)}</p>
        </div>
        <button type="button" className="bo-button bo-button--danger" aria-label={T.removeRule(number)} onClick={remove}>
          <Icon of={Trash2} size={16} />
          {vi.common.remove}
        </button>
      </div>
      <FieldError message={errors[rulePath(rule.key, "rule")]} />
      <RuleWhatFields rule={rule} choices={choices} errors={errors} edit={edit} />
      <RuleWhenFields rule={rule} choices={choices} errors={errors} edit={edit} />
    </li>
  );
}
