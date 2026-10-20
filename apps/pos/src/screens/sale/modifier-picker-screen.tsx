import type { PosProduct } from "@fnb/contracts";
import { formatVnd } from "@fnb/domain";
import { Check } from "lucide-react";
import { type ReactNode, useState } from "react";
import { newId } from "../../features/ids/new-id";
import { type CartLine, MAX_LINE_QUANTITY, cleanNote } from "../../features/order/counter-order";
import { modifierErrorMessage } from "../../features/order/modifier-error-message";
import {
  type Choices,
  choicesForVariant,
  confirmChoices,
  dropOptionUnit,
  tapOption,
} from "../../features/order/modifier-choices";
import { linePreviewTotal } from "../../features/order/line-preview-total";
import type { TillMenu } from "../../features/menu/till-menu";
import { vi } from "../../messages/vi";
import { Icon } from "../shared/icon";
import { Alert, ScreenFrame } from "../shared/screen-frame";
import { ModifierGroupField } from "./modifier-group-field";
import { PickerProductHead } from "./picker-product-head";
import { QuickNotes } from "./quick-notes";
import { QuantityStepper } from "./quantity-stepper";

const P = vi.sale.picker;

export interface ModifierPickerScreenProps {
  header: ReactNode;
  menu: TillMenu;
  product: PosProduct;
  now: number;
  onAdd(line: CartLine): void;
  onCancel(): void;
}

/** Size, options by the group rules, how many, a note; refusals explained by the domain. */
export function ModifierPickerScreen({
  header,
  menu,
  product,
  now,
  onAdd,
  onCancel,
}: ModifierPickerScreenProps) {
  const [variantId, setVariantId] = useState<string | null>(product.variants[0]?.id ?? null);
  const [choices, setChoices] = useState<Choices>([]);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const draft: CartLine = {
    lineId: "preview",
    productId: product.id,
    variantId,
    modifiers: choices,
    quantity,
    note: null,
  };
  const total = linePreviewTotal(menu, draft, now);

  function tap(groupId: string, optionId: string) {
    const group = product.modifierGroups.find((candidate) => candidate.id === groupId);
    if (group === undefined) return;
    const result = tapOption(product, variantId, group, optionId, choices);
    if (result.ok) {
      setChoices(result.choices);
      setError(null);
    } else setError(modifierErrorMessage(product, result.error));
  }

  function add() {
    const checked = confirmChoices(product, variantId, choices);
    if (!checked.ok) return setError(modifierErrorMessage(product, checked.error));
    const modifiers = checked.selections.map(({ groupId, optionId, quantity: units }) => ({
      groupId,
      optionId,
      quantity: units,
    }));
    onAdd({
      lineId: newId(),
      productId: product.id,
      variantId,
      modifiers,
      quantity,
      note: cleanNote(note),
    });
  }

  return (
    <ScreenFrame
      title={product.name}
      dock={
        <>
          <Alert message={error} />
          <div className="pos-actions pos-actions--split">
            <button type="button" className="pos-button" onClick={onCancel}>
              {P.cancel}
            </button>
            <button
              type="button"
              className="pos-button pos-button--primary pos-button--lg pos-wrap"
              onClick={add}
            >
              {total === null ? P.addNoPrice : P.add(formatVnd(total))}
            </button>
          </div>
        </>
      }
    >
      {header}
      <PickerProductHead menu={menu} product={product} now={now} />
      {product.variants.length > 0 ? (
        <fieldset className="pos-group pos-choice-group">
          <legend className="pos-group__legend">{P.variant}</legend>
          <ul className="pos-chips">
            {product.variants.map((variant) => (
              <li key={variant.id} className="pos-chip-item">
                <button
                  type="button"
                  className="pos-chip pos-chip--size"
                  aria-pressed={variant.id === variantId}
                  onClick={() => {
                    setVariantId(variant.id);
                    setChoices(choicesForVariant(product, variant.id, choices));
                    setError(null);
                  }}
                >
                  <Icon of={Check} size={18} />
                  <span className="pos-chip__name">{variant.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </fieldset>
      ) : null}
      {product.modifierGroups.map((group) => (
        <ModifierGroupField
          key={group.id}
          product={product}
          group={group}
          variantId={variantId}
          choices={choices}
          onTap={(optionId) => tap(group.id, optionId)}
          onFewer={(optionId) => setChoices(dropOptionUnit(group, optionId, choices))}
        />
      ))}
      <section className="pos-card pos-picker__more">
        <div className="pos-picker__quantity">
          <span className="pos-field__label">{P.quantity}</span>
          <QuantityStepper
            label={P.quantity}
            name={product.name}
            value={quantity}
            max={MAX_LINE_QUANTITY}
            onChange={setQuantity}
          />
        </div>
        <label className="pos-field">
          <span className="pos-field__label">{vi.sale.note}</span>
          <textarea
            className="pos-input pos-note"
            rows={2}
            maxLength={500}
            placeholder={P.notePlaceholder}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <QuickNotes note={note} onChange={setNote} />
      </section>
    </ScreenFrame>
  );
}
