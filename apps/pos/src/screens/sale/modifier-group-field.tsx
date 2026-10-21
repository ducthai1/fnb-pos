import type { PosProduct } from "@fnb/contracts";
import { type ModifierGroup, effectiveModifierGroupRule, formatVnd } from "@fnb/domain";
import { Check, Minus } from "lucide-react";
import { type Choices, isSingleChoice, unitsOf } from "../../features/order/modifier-choices";
import { vi } from "../../messages/vi";
import { Icon } from "../shared/icon";

const P = vi.sale.picker;

function limitText(min: number, max: number): string {
  if (max === 1) return P.pickOne;
  return min === 0 ? P.pickUpTo(max) : P.pickBetween(min, max);
}

export interface ModifierGroupFieldProps {
  product: PosProduct;
  group: ModifierGroup;
  variantId: string | null;
  choices: Choices;
  onTap(optionId: string): void;
  onFewer(optionId: string): void;
}

/**
 * One group of options as chips, with its limits for the chosen size and how many are picked
 * so far: a required group still short of its minimum says so in amber, never by colour alone.
 */
export function ModifierGroupField(props: ModifierGroupFieldProps) {
  const { group, variantId, choices } = props;
  const rule = effectiveModifierGroupRule(group, variantId);
  if (rule.hidden) return null;
  const single = isSingleChoice(group, variantId);
  const picked = choices
    .filter((choice) => choice.groupId === group.id)
    .reduce((sum, choice) => sum + choice.quantity, 0);
  const short = picked < rule.minSelect;
  return (
    <fieldset className="pos-group pos-choice-group">
      <legend className="pos-group__legend pos-wrap">
        {group.name}
        <span className="pos-group__rule">
          {limitText(rule.minSelect, rule.maxSelect)}
          {rule.minSelect > 0 ? ` · ${P.required}` : ""}
        </span>
      </legend>
      <p
        className="pos-badge pos-choice-group__count"
        data-tone={short ? "warn" : picked > 0 ? "ok" : undefined}
        data-picked={picked}
      >
        {P.picked(picked, rule.maxSelect)}
      </p>
      {/* Several may be picked: each chip draws a tick box instead of a tick. */}
      <ul className="pos-chips" data-multi={!single}>
        {group.options.map((option) => {
          const units = unitsOf(choices, option.id);
          return (
            <li key={option.id} className="pos-chip-item">
              <button
                type="button"
                className="pos-chip"
                aria-pressed={units > 0}
                onClick={() => props.onTap(option.id)}
              >
                <Icon of={Check} size={18} />
                <span className="pos-chip__name">{option.name}</span>
                {/* Spaces as their own text: a name computed from spans drops a leading one. */}
                {option.priceDelta === 0n ? null : " "}
                {option.priceDelta === 0n ? null : (
                  <span className="pos-chip__price">+{formatVnd(option.priceDelta)}</span>
                )}
                {!single && units > 1 ? " " : null}
                {!single && units > 1 ? <span className="pos-chip__units">×{units}</span> : null}
              </button>
              {!single && group.allowDuplicates && units > 0 ? (
                <button
                  type="button"
                  className="pos-chip pos-chip--fewer"
                  aria-label={P.fewer(option.name)}
                  onClick={() => props.onFewer(option.id)}
                >
                  <Icon of={Minus} size={18} />
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
