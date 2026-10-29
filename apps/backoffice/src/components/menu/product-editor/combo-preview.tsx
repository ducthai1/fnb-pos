"use client";

import {
  type ComboSlot,
  type ComboSlotSelectionInput,
  type Product,
  addVnd,
  formatVnd,
  isDomainError,
  resolveCombo,
  vnd,
} from "@fnb/domain";
import { useState } from "react";
import type { ProductSummary } from "../../../lib/api/catalog-api";
import { messageForCode } from "../../../lib/errors/failure-message";
import { vi } from "../../../messages/vi";
import { CheckField } from "../../ui/check-field";

const T = vi.menu.preview;

type Counts = Readonly<Record<string, number>>;
const countKey = (slotId: string, index: number) => `${slotId}:${index}`;

/** "Trà sữa (L)": the product a slot offers, as the till's picker names it. */
function optionLabel(
  products: readonly ProductSummary[],
  productId: string,
  variantId: string | null,
) {
  const product = products.find((candidate) => candidate.id === productId);
  const size = product?.variants?.find((variant) => variant.id === variantId);
  const name = product?.name ?? vi.menu.editor.unnamed;
  return size === undefined ? name : `${name} (${size.name})`;
}

/**
 * A combo tried as the cashier fills it: picks per slot, judged and priced by the domain's
 * resolveCombo exactly as the till does (the combo's price plus each pick's upcharge); a
 * refusal shows on the slot it is about.
 */
export function ComboPreview({
  product,
  products,
}: {
  product: Product;
  products: readonly ProductSummary[];
}) {
  const [counts, setCounts] = useState<Counts>({});
  const slots = product.combo?.slots ?? [];
  const picks: ComboSlotSelectionInput[] = slots.flatMap((slot) =>
    slot.options.flatMap((option, index) =>
      Array.from({ length: counts[countKey(slot.id, index)] ?? 0 }, () => ({
        slotId: slot.id,
        productId: option.productId,
        variantId: option.variantId,
      })),
    ),
  );
  let outcome: { ok: true; total: string } | { ok: false; slotId: unknown; message: string };
  try {
    const resolved = resolveCombo(product, picks);
    outcome = {
      ok: true,
      total: formatVnd(addVnd(product.basePrice ?? vnd(0), resolved.totalUpcharge)),
    };
  } catch (error) {
    if (!isDomainError(error)) throw error;
    outcome = { ok: false, slotId: error.details?.slotId, message: messageForCode(error.code) };
  }
  const setCount = (slot: ComboSlot, index: number, count: number) =>
    setCounts((current) => {
      // A slot of one keeps one pick: choosing another option drops the first.
      const cleared =
        slot.maxSelect === 1
          ? Object.fromEntries(
              Object.entries(current).filter(([key]) => !key.startsWith(`${slot.id}:`)),
            )
          : current;
      return { ...cleared, [countKey(slot.id, index)]: Math.max(0, count) };
    });
  return (
    <>
      <p className="bo-muted">{T.comboHint}</p>
      {slots.map((slot) => (
        <fieldset key={slot.id} className="bo-fieldset" aria-label={slot.name}>
          <legend className="bo-wrap">
            {slot.name} · {T.limits(slot.minSelect, slot.maxSelect)}
            {slot.minSelect >= 1 ? ` · ${T.required}` : ""}
          </legend>
          {slot.options.map((option, index) => {
            const count = counts[countKey(slot.id, index)] ?? 0;
            const name = optionLabel(products, option.productId, option.variantId);
            const label =
              option.upcharge === 0n ? name : `${name} ${T.upcharge(formatVnd(option.upcharge))}`;
            if (slot.maxSelect === 1) {
              return (
                <CheckField
                  key={index}
                  label={label}
                  checked={count > 0}
                  onChange={(on) => setCount(slot, index, on ? 1 : 0)}
                />
              );
            }
            return (
              <div key={index} className="bo-stepper">
                <span className="bo-wrap">{label}</span>
                <button
                  type="button"
                  className="bo-button"
                  aria-label={T.less(name)}
                  onClick={() => setCount(slot, index, count - 1)}
                >
                  −
                </button>
                <output aria-label={T.count(name)}>{count}</output>
                <button
                  type="button"
                  className="bo-button"
                  aria-label={T.more(name)}
                  onClick={() => setCount(slot, index, count + 1)}
                >
                  +
                </button>
              </div>
            );
          })}
          {!outcome.ok && outcome.slotId === slot.id && (
            <p className="bo-field__error" data-preview-refusal>
              {outcome.message}
            </p>
          )}
        </fieldset>
      ))}
      {!outcome.ok && !slots.some((slot) => slot.id === outcome.slotId) && (
        <p className="bo-notice bo-notice--error" data-preview-refusal>
          {outcome.message}
        </p>
      )}
      {outcome.ok && (
        <p className="bo-notice bo-notice--ok" role="status" data-preview-total>
          {T.comboTotal(outcome.total)}
        </p>
      )}
    </>
  );
}
