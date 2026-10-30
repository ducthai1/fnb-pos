import type { PosProduct } from "@fnb/contracts";
import { formatVnd } from "@fnb/domain";
import { Check } from "lucide-react";
import { type ReactNode, useState } from "react";
import { newId } from "../../features/ids/new-id";
import { type CartLine, cleanNote } from "../../features/order/counter-order";
import { modifierErrorMessage } from "../../features/order/modifier-error-message";
import {
  type Choices,
  choicesForVariant,
  confirmChoices,
  dropOptionUnit,
  tapOption,
} from "../../features/order/modifier-choices";
import { linePreviewTotal } from "../../features/order/line-preview-total";
import { entryNeeded } from "../../features/order/plain-cart-line";
import type { TillMenu } from "../../features/menu/till-menu";
import { vi } from "../../messages/vi";
import { useTillKey } from "../shared/use-till-key";
import { Icon } from "../shared/icon";
import { Alert, ScreenFrame } from "../shared/screen-frame";
import { useFinishThen, useLeaveThen } from "../shared/use-leave-motion";
import { ComboPickerScreen } from "./combo-picker-screen";
import { ModifierGroupField } from "./modifier-group-field";
import { PickerProductHead } from "./picker-product-head";
import { PickerMoreSection } from "./picker-more-section";

const P = vi.sale.picker;

export interface ModifierPickerScreenProps {
  header: ReactNode;
  menu: TillMenu;
  product: PosProduct;
  now: number;
  onAdd(line: CartLine): void;
  onCancel(): void;
  /**
   * Changing the options of a line already on the order: the picker opens on that line's
   * choices and its button says the old item is cancelled and ordered again.
   */
  replacing?: CartLine | undefined;
}

/** The picker a tapped product opens: a combo's slots, or an item's size and options. */
export function ModifierPickerScreen(props: ModifierPickerScreenProps) {
  return props.product.kind === "combo" ? (
    <ComboPickerScreen {...props} />
  ) : (
    <ItemOptionsPicker {...props} />
  );
}

/** Size, options by the group rules, how many, a note; refusals explained by the domain. */
function ItemOptionsPicker({
  header,
  menu,
  product,
  now,
  onAdd,
  onCancel,
  replacing,
}: ModifierPickerScreenProps) {
  // Back plays the step's leaving movement before the flow closes it.
  const { leaving, leave } = useLeaveThen(onCancel, "--t-exit");
  // Adding the line sinks the step away the same way, then the flow puts the line on the order.
  const { closing, finish } = useFinishThen<CartLine>(onAdd);
  const [variantId, setVariantId] = useState<string | null>(
    replacing === undefined ? (product.variants[0]?.id ?? null) : replacing.variantId,
  );
  const [choices, setChoices] = useState<Choices>(replacing?.modifiers ?? []);
  const [quantity, setQuantity] = useState(replacing?.quantity ?? 1);
  const [note, setNote] = useState(replacing?.note ?? "");
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
  // A price typed or a weight weighed next, in its own drawer: no total here yet, and a
  // weighing is one, so it has no quantity to count.
  const entry = entryNeeded(product);
  useTillKey(vi.sale.keys.back, leave);

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
    finish({
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
      enter="sheet"
      leaving={leaving || closing}
      title={replacing === undefined ? product.name : vi.adjust.change.pickerTitle(product.name)}
      dock={
        <>
          <Alert message={error} />
          <div className="pos-actions pos-actions--split">
            <button type="button" className="pos-button" onClick={leave}>
              {P.cancel}
              <kbd className="pos-kbd" aria-hidden>
                {vi.sale.backKeyCap}
              </kbd>
            </button>
            <button
              type="button"
              className="pos-button pos-button--primary pos-button--lg pos-wrap"
              onClick={add}
            >
              {entry !== null
                ? P.next[entry]
                : replacing !== undefined
                  ? total === null
                    ? vi.adjust.change.confirmNoPrice
                    : vi.adjust.change.confirm(formatVnd(total))
                  : total === null
                    ? P.addNoPrice
                    : P.add(formatVnd(total))}
            </button>
          </div>
        </>
      }
    >
      {header}
      {replacing === undefined ? null : <p className="pos-hint">{vi.adjust.change.pickerHint}</p>}
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
      <PickerMoreSection
        name={product.name}
        quantity={entry === "weight" ? null : quantity}
        onQuantity={setQuantity}
        note={note}
        onNote={setNote}
      />
    </ScreenFrame>
  );
}
