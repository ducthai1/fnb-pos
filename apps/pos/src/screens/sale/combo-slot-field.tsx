import type { PosProduct } from "@fnb/contracts";
import { type ComboSlot, type ComboSlotOption, formatVnd } from "@fnb/domain";
import { Check, Minus } from "lucide-react";
import {
  type PickerPick,
  offeredOptions,
  optionKey,
  optionName,
  picksIn,
} from "../../features/order/combo-picks";
import { dropOptionUnit, tapOption } from "../../features/order/modifier-choices";
import { modifierErrorMessage } from "../../features/order/modifier-error-message";
import type { TillMenu } from "../../features/menu/till-menu";
import { vi } from "../../messages/vi";
import { Icon } from "../shared/icon";
import { ModifierGroupField } from "./modifier-group-field";

const P = vi.sale.picker;
const M = vi.sale.combo;

function limitText(min: number, max: number): string {
  if (max === 1) return P.pickOne;
  return min === 0 ? P.pickUpTo(max) : P.pickBetween(min, max);
}

export interface ComboSlotFieldProps {
  menu: TillMenu;
  slot: ComboSlot;
  picks: readonly PickerPick[];
  soldOut(option: ComboSlotOption): boolean;
  onTap(option: ComboSlotOption): void;
  onFewer(option: ComboSlotOption): void;
  onPickChoices(key: string, choices: PickerPick["modifiers"]): void;
  onError(message: string | null): void;
}

/**
 * One place of a combo, laid out like a group of options: its name and limits, how many are
 * picked, the products it offers as chips (with what a swap costs), and under it each pick's
 * own options (sugar, ice) in the same chips the item picker uses.
 */
export function ComboSlotField(props: ComboSlotFieldProps) {
  const { menu, slot } = props;
  const inSlot = picksIn(props.picks, slot.id);
  const multi = slot.maxSelect > 1;
  const short = inSlot.length < slot.minSelect;
  return (
    <fieldset className="pos-group pos-choice-group pos-combo-slot" data-slot={slot.id}>
      <legend className="pos-group__legend pos-wrap">
        {slot.name}
        <span className="pos-group__rule">
          {limitText(slot.minSelect, slot.maxSelect)}
          {slot.minSelect > 0 ? ` · ${P.required}` : ""}
        </span>
      </legend>
      <p
        className="pos-badge pos-choice-group__count"
        data-tone={short ? "warn" : inSlot.length > 0 ? "ok" : undefined}
        data-picked={inSlot.length}
      >
        {P.picked(inSlot.length, slot.maxSelect)}
      </p>
      <ul className="pos-chips" data-multi={multi}>
        {offeredOptions(menu, slot).map((option) => {
          const key = optionKey(option);
          const units = inSlot.filter((pick) => optionKey(pick) === key).length;
          const soldOut = props.soldOut(option);
          const name = optionName(menu, option);
          return (
            <li key={key} className="pos-chip-item">
              <button
                type="button"
                className="pos-chip"
                aria-pressed={units > 0}
                disabled={soldOut && units === 0}
                data-sold-out={soldOut || undefined}
                onClick={() => props.onTap(option)}
              >
                <Icon of={Check} size={18} />
                <span className="pos-chip__name">{name}</span>
                {option.upcharge === 0n ? null : " "}
                {option.upcharge === 0n ? null : (
                  <span className="pos-chip__price">{M.upcharge(formatVnd(option.upcharge))}</span>
                )}
                {soldOut ? " " : null}
                {soldOut ? <span className="pos-chip__flag">{vi.sale.soldOut}</span> : null}
                {multi && units > 1 ? " " : null}
                {multi && units > 1 ? <span className="pos-chip__units">×{units}</span> : null}
              </button>
              {multi && units > 0 ? (
                <button
                  type="button"
                  className="pos-chip pos-chip--fewer"
                  aria-label={P.fewer(name)}
                  onClick={() => props.onFewer(option)}
                >
                  <Icon of={Minus} size={18} />
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {inSlot.map((pick) => {
        const product = menu.productsById.get(pick.productId);
        if (product === undefined || product.modifierGroups.length === 0) return null;
        const name = optionName(menu, pick);
        const same = inSlot.filter((other) => optionKey(other) === optionKey(pick));
        const title = same.length > 1 ? M.portion(name, same.indexOf(pick) + 1) : name;
        return (
          <PickOptions
            key={pick.key}
            product={product}
            pick={pick}
            title={title}
            onChoices={(choices) => props.onPickChoices(pick.key, choices)}
            onError={props.onError}
          />
        );
      })}
    </fieldset>
  );
}

function PickOptions(props: {
  product: PosProduct;
  pick: PickerPick;
  title: string;
  onChoices(choices: PickerPick["modifiers"]): void;
  onError(message: string | null): void;
}) {
  const { product, pick } = props;
  return (
    <section className="pos-combo-pick" aria-label={M.pickOptions(props.title)}>
      <p className="pos-combo-pick__title pos-wrap">{props.title}</p>
      {product.modifierGroups.map((group) => (
        <ModifierGroupField
          key={group.id}
          product={product}
          group={group}
          variantId={pick.variantId}
          choices={pick.modifiers}
          onTap={(optionId) => {
            const result = tapOption(product, pick.variantId, group, optionId, pick.modifiers);
            if (result.ok) {
              props.onChoices(result.choices);
              props.onError(null);
            } else props.onError(modifierErrorMessage(product, result.error));
          }}
          onFewer={(optionId) => props.onChoices(dropOptionUnit(group, optionId, pick.modifiers))}
        />
      ))}
    </section>
  );
}
