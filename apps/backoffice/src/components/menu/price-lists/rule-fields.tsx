"use client";

import { useMemo } from "react";
import type { Branch } from "../../../lib/api/branch-api";
import type { Category, ProductSummary } from "../../../lib/api/catalog-api";
import { type DraftErrors, rulePath } from "../../../lib/catalog/price-list/check-price-list-draft";
import type { EffectKind, RuleDraft, ScopeKind } from "../../../lib/catalog/price-list/price-list-draft";
import { vi } from "../../../messages/vi";
import { Listbox, type ListboxChoice } from "../../ui/listbox";
import { FieldError, TextField } from "../../ui/text-field";

const T = vi.priceLists.editor;
const SCOPES: readonly ScopeKind[] = ["global", "category", "product", "variant"];
const EFFECTS: readonly EffectKind[] = ["percent_off", "fixed_price"];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

/** What a rule's boxes offer to pick from: the brand's menu and the branches. */
export interface RuleChoices {
  readonly categories: readonly Category[];
  readonly products: readonly ProductSummary[];
  readonly branches: readonly Branch[];
}

const withPick = (choices: readonly ListboxChoice[]): readonly ListboxChoice[] => [
  { value: "", label: T.pick },
  ...choices,
];

export type RuleEdit = (patch: Partial<RuleDraft>) => void;

/** What a rule applies to and how it prices: scope, its target, the effect and its value. */
export function RuleWhatFields({
  rule,
  choices,
  errors,
  edit,
}: {
  rule: RuleDraft;
  choices: RuleChoices;
  errors: DraftErrors;
  edit: RuleEdit;
}) {
  const at = (field: string) => errors[rulePath(rule.key, field)];
  const live = useMemo(() => choices.products.filter((product) => product.archivedAt === null), [choices.products]);
  const sizes = live.find((product) => product.id === rule.productId)?.variants ?? [];
  return (
    <>
      <div className="bo-row bo-rule-row">
        <Listbox
          className="bo-listbox--field"
          label={T.scope}
          value={rule.scopeKind}
          choices={SCOPES.map((kind) => ({ value: kind, label: T.scopes[kind] }))}
          onChange={(kind) => edit({ scopeKind: kind as ScopeKind, categoryId: "", productId: "", variantId: "" })}
        />
        {rule.scopeKind === "category" && (
          <div className="bo-listbox-field">
            <Listbox
              className="bo-listbox--field"
              label={T.category}
              value={rule.categoryId}
              choices={withPick(choices.categories.map((c) => ({ value: c.id, label: c.name })))}
              onChange={(categoryId) => edit({ categoryId })}
            />
            <FieldError message={at("target")} />
          </div>
        )}
        {(rule.scopeKind === "product" || rule.scopeKind === "variant") && (
          <div className="bo-listbox-field">
            <Listbox
              className="bo-listbox--field"
              label={T.product}
              value={rule.productId}
              choices={withPick(live.map((p) => ({ value: p.id, label: p.name })))}
              onChange={(productId) => edit({ productId, variantId: "" })}
            />
            <FieldError message={at("target")} />
          </div>
        )}
        {rule.scopeKind === "variant" && (
          <div className="bo-listbox-field">
            <Listbox
              className="bo-listbox--field"
              label={T.variant}
              value={rule.variantId}
              choices={withPick(sizes.map((s) => ({ value: s.id, label: s.name })))}
              disabled={rule.productId === ""}
              onChange={(variantId) => edit({ variantId })}
            />
            <FieldError message={at("variant") ?? (rule.productId !== "" && sizes.length === 0 ? vi.priceLists.errors.productHasNoSizes : undefined)} />
          </div>
        )}
      </div>
      <div className="bo-row bo-rule-row">
        <div className="bo-listbox-field">
          <Listbox
            className="bo-listbox--field"
            label={T.effect}
            value={rule.effectKind}
            choices={EFFECTS.map((kind) => ({ value: kind, label: T.effects[kind] }))}
            onChange={(kind) => edit({ effectKind: kind as EffectKind, value: "" })}
          />
          <FieldError message={at("effect")} />
        </div>
        <TextField
          label={rule.effectKind === "percent_off" ? T.percent : T.fixedPrice}
          value={rule.value}
          inputMode={rule.effectKind === "percent_off" ? "decimal" : "numeric"}
          hint={rule.effectKind === "percent_off" ? T.percentHint : T.fixedPriceHint}
          onChange={(value) => edit({ value })}
          error={at("value")}
        />
      </div>
    </>
  );
}

/** Where and when: branch, channel, weekdays, hours, dates, priority. */
export function RuleWhenFields({
  rule,
  choices,
  errors,
  edit,
}: {
  rule: RuleDraft;
  choices: RuleChoices;
  errors: DraftErrors;
  edit: RuleEdit;
}) {
  const at = (field: string) => errors[rulePath(rule.key, field)];
  const toggle = (day: number) =>
    edit({ days: rule.days.includes(day) ? rule.days.filter((d) => d !== day) : [...rule.days, day] });
  return (
    <>
      <div className="bo-row bo-rule-row">
        <Listbox
          className="bo-listbox--field"
          label={T.branch}
          value={rule.branchId}
          choices={[{ value: "", label: T.allBranches }, ...choices.branches.map((b) => ({ value: b.id, label: b.name }))]}
          onChange={(branchId) => edit({ branchId })}
        />
        <TextField label={T.channel} value={rule.channelKey} hint={T.channelHint} onChange={(channelKey) => edit({ channelKey })} error={at("channel")} />
        <TextField label={T.priority} value={rule.priority} inputMode="numeric" hint={T.priorityHint} onChange={(priority) => edit({ priority })} error={at("priority")} />
      </div>
      <fieldset className="bo-rule-days" aria-describedby={`days-${rule.key}`}>
        <legend>{T.days}</legend>
        <div className="bo-rule-days__chips">
          {DAY_ORDER.map((day) => (
            <button
              key={day}
              type="button"
              className="bo-chip"
              aria-pressed={rule.days.includes(day)}
              aria-label={T.dayLong[day]}
              onClick={() => toggle(day)}
            >
              {T.dayShort[day]}
            </button>
          ))}
        </div>
        <span id={`days-${rule.key}`} className="bo-muted">
          {T.daysHint}
        </span>
        <FieldError message={at("days")} />
      </fieldset>
      <div className="bo-row bo-rule-row">
        <TextField label={T.start} value={rule.start} placeholder="14:00" inputMode="numeric" onChange={(start) => edit({ start })} error={at("time")} />
        <TextField label={T.end} value={rule.end} placeholder="17:00" inputMode="numeric" hint={T.timeHint} onChange={(end) => edit({ end })} />
      </div>
      <div className="bo-row bo-rule-row">
        <TextField label={T.from} value={rule.from} placeholder="01/11/2026" inputMode="numeric" onChange={(from) => edit({ from })} error={at("from")} />
        <TextField label={T.to} value={rule.to} placeholder="07/11/2026" inputMode="numeric" hint={T.dateHint} onChange={(to) => edit({ to })} error={at("to")} />
      </div>
    </>
  );
}
