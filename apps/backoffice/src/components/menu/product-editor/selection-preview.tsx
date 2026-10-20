"use client";

import { type ModifierGroup, type Product, effectiveModifierGroupRule, formatVnd } from "@fnb/domain";
import { useState } from "react";
import { nameMark } from "../../../lib/format/name-mark";
import { vi } from "../../../messages/vi";
import { CheckField } from "../../ui/select-field";
import { EDITOR_SECTIONS } from "./editor-sections";
import { type PreviewCounts, countKey, previewMessage, previewOutcome } from "./preview-outcome";

const T = vi.menu.preview;

/**
 * Lets the person pick as a customer would, judged by the domain's validateModifierSelection
 * exactly as the till judges it: a refusal shows on the group it is about.
 */
export function SelectionPreview({ product, branchId }: { product: Product | null; branchId: string }) {
  const [chosenVariant, setChosenVariant] = useState<string | null>(null);
  const [counts, setCounts] = useState<PreviewCounts>({});

  if (product === null) {
    return (
      <section className="bo-card" aria-label={T.title} id={EDITOR_SECTIONS.preview}>
        <h2 className="bo-subtitle">{T.title}</h2>
        <p className="bo-muted">{T.notReady}</p>
      </section>
    );
  }
  const variantId =
    product.variants.find((variant) => variant.id === chosenVariant)?.id ?? product.variants[0]?.id ?? null;
  const outcome = previewOutcome(product, variantId, counts, branchId, Date.now());
  const refusedGroup = outcome.ok ? null : outcome.error.details?.groupId;
  // A refusal about no group on screen (a size problem, say) shows under the groups instead.
  const onAGroup = product.modifierGroups.some((group) => group.id === refusedGroup);
  const setCount = (groupId: string, optionId: string, count: number) =>
    setCounts((current) => ({ ...current, [countKey(groupId, optionId)]: Math.max(0, count) }));

  return (
    // Polite, not an alert: a customer's half-made choice is not an error of the page.
    <section className="bo-card bo-preview" aria-label={T.title} aria-live="polite" id={EDITOR_SECTIONS.preview}>
      <h2 className="bo-subtitle">{T.title}</h2>
      <p className="bo-muted">{T.hint}</p>
      <div className="bo-preview__head" aria-hidden="true">
        <span className="bo-preview__mark" data-initial={nameMark(product.name)} />
        <span className="bo-stack">
          <strong className="bo-wrap">{product.name}</strong>
          {product.basePrice !== null && <span className="bo-muted">{formatVnd(product.basePrice)}</span>}
        </span>
      </div>
      {product.variants.length > 0 && (
        <fieldset className="bo-fieldset bo-row">
          <legend>{T.variant}</legend>
          {product.variants.map((variant) => (
            <label key={variant.id} className="bo-field--inline bo-wrap">
              <input
                type="radio"
                name="preview-variant"
                checked={variant.id === variantId}
                onChange={() => setChosenVariant(variant.id)}
              />
              {variant.name}
            </label>
          ))}
        </fieldset>
      )}
      {product.modifierGroups.map((group) => (
        <PreviewGroup
          key={group.id}
          group={group}
          variantId={variantId}
          counts={counts}
          error={refusedGroup === group.id && !outcome.ok ? previewMessage(outcome.error) : null}
          setCount={setCount}
        />
      ))}
      {!outcome.ok && !onAGroup && (
        <p className="bo-notice bo-notice--error" data-preview-refusal>
          {previewMessage(outcome.error)}
        </p>
      )}
      {outcome.ok && (
        <p className="bo-notice bo-notice--ok" role="status" data-preview-total>
          {outcome.unitPrice === null
            ? T.totalOpenPrice(formatVnd(outcome.extras))
            : T.total(formatVnd(outcome.unitPrice))}
        </p>
      )}
    </section>
  );
}

function PreviewGroup({
  group,
  variantId,
  counts,
  error,
  setCount,
}: {
  group: ModifierGroup;
  variantId: string | null;
  counts: PreviewCounts;
  error: string | null;
  setCount: (groupId: string, optionId: string, count: number) => void;
}) {
  const rule = effectiveModifierGroupRule(group, variantId);
  return (
    <fieldset className="bo-fieldset" aria-label={group.name}>
      <legend className="bo-wrap">
        {group.name} · {T.limits(rule.minSelect, rule.maxSelect)}
        {rule.minSelect >= 1 ? ` · ${T.required}` : ""}
      </legend>
      {rule.hidden ? (
        <p className="bo-muted">{T.hiddenForVariant}</p>
      ) : (
        group.options.map((option) => {
          const count = counts[countKey(group.id, option.id)] ?? 0;
          const label = `${option.name} +${formatVnd(option.priceDelta)}`;
          if (!group.allowDuplicates) {
            return (
              <CheckField
                key={option.id}
                label={label}
                checked={count > 0}
                onChange={(on) => setCount(group.id, option.id, on ? 1 : 0)}
              />
            );
          }
          return (
            <div key={option.id} className="bo-stepper">
              <span className="bo-wrap">{label}</span>
              <button type="button" className="bo-button" aria-label={T.less(option.name)} onClick={() => setCount(group.id, option.id, count - 1)}>
                −
              </button>
              <output aria-label={T.count(option.name)}>{count}</output>
              <button type="button" className="bo-button" aria-label={T.more(option.name)} onClick={() => setCount(group.id, option.id, count + 1)}>
                +
              </button>
            </div>
          );
        })
      )}
      {error !== null && (
        <p className="bo-field__error" data-preview-refusal>
          {error}
        </p>
      )}
    </fieldset>
  );
}
