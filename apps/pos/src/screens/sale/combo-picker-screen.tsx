import type { PosProduct } from "@fnb/contracts";
import { type ComboSlotOption, formatVnd } from "@fnb/domain";
import { type ReactNode, useState } from "react";
import { newId } from "../../features/ids/new-id";
import { COUNTER_CHANNEL } from "../../features/menu/menu-prices";
import { isSoldOut } from "../../features/menu/product-availability";
import type { TillMenu } from "../../features/menu/till-menu";
import { confirmComboPicks } from "../../features/order/combo-confirm";
import {
  type PickerPick,
  cartPicks,
  dropComboOption,
  initialPicks,
  offeredOptions,
  setPickModifiers,
  slotsOf,
  tapComboOption,
} from "../../features/order/combo-picks";
import { type CartLine, cleanNote } from "../../features/order/counter-order";
import { linePreviewTotal } from "../../features/order/line-preview-total";
import { vi } from "../../messages/vi";
import { Alert, ScreenFrame } from "../shared/screen-frame";
import { useTillKey } from "../shared/use-till-key";
import { ComboSlotField } from "./combo-slot-field";
import { PickerMoreSection } from "./picker-more-section";
import { PickerProductHead } from "./picker-product-head";

const P = vi.sale.picker;
const M = vi.sale.combo;

export interface ComboPickerScreenProps {
  header: ReactNode;
  menu: TillMenu;
  product: PosProduct;
  now: number;
  onAdd(line: CartLine): void;
  onCancel(): void;
}

/**
 * A combo's slots, each with the products it offers and each pick's own options, then how
 * many and a note. The total on the button is the domain's, with every upcharge and option;
 * what the domain refuses is said in the slot's or the pick's own words.
 */
export function ComboPickerScreen({
  header,
  menu,
  product,
  now,
  onAdd,
  onCancel,
}: ComboPickerScreenProps) {
  const soldOut = (option: ComboSlotOption) =>
    isSoldOut(menu.availability.get(option.productId), COUNTER_CHANNEL, now);
  const [picks, setPicks] = useState<PickerPick[]>(() =>
    initialPicks(menu, product, (option) => !soldOut(option)),
  );
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  useTillKey(vi.sale.keys.back, onCancel);
  const draft: CartLine = {
    lineId: "preview",
    productId: product.id,
    variantId: null,
    modifiers: [],
    comboPicks: cartPicks(picks),
    quantity,
    note: null,
  };
  const total = linePreviewTotal(menu, draft, now);
  const emptyRequired = slotsOf(product).find(
    (slot) => slot.minSelect > 0 && offeredOptions(menu, slot).every((option) => soldOut(option)),
  );

  function add() {
    if (emptyRequired !== undefined) return setError(M.allSoldOut(emptyRequired.name));
    const checked = confirmComboPicks(menu, product, picks);
    if (!checked.ok) return setError(checked.message);
    onAdd({
      lineId: newId(),
      productId: product.id,
      variantId: null,
      modifiers: [],
      comboPicks: checked.picks,
      quantity,
      note: cleanNote(note),
    });
  }

  return (
    <ScreenFrame
      enter="sheet"
      title={product.name}
      dock={
        <>
          <Alert message={error} />
          <div className="pos-actions pos-actions--split">
            <button type="button" className="pos-button" onClick={onCancel}>
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
              {total === null ? P.addNoPrice : P.add(formatVnd(total))}
            </button>
          </div>
        </>
      }
    >
      {header}
      <PickerProductHead menu={menu} product={product} now={now} />
      {slotsOf(product).map((slot) => (
        <ComboSlotField
          key={slot.id}
          menu={menu}
          slot={slot}
          picks={picks}
          soldOut={soldOut}
          onTap={(option) => {
            const next = tapComboOption(picks, slot, option);
            if (next === null) return setError(M.slotFull(slot.name, slot.maxSelect));
            setPicks(next);
            setError(null);
          }}
          onFewer={(option) => {
            setPicks(dropComboOption(picks, slot, option));
            setError(null);
          }}
          onPickChoices={(key, choices) => setPicks(setPickModifiers(picks, key, choices))}
          onError={setError}
        />
      ))}
      <PickerMoreSection
        name={product.name}
        quantity={quantity}
        onQuantity={setQuantity}
        note={note}
        onNote={setNote}
      />
    </ScreenFrame>
  );
}
