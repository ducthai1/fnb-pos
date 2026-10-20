import type { PosProduct } from "@fnb/contracts";
import { type ModifierGroup, effectiveModifierGroupRule, formatVnd } from "@fnb/domain";
import { type Choices, isSingleChoice, unitsOf } from "../../features/order/modifier-choices";
import { vi } from "../../messages/vi";

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

/** One group of options with its limits for the chosen size: a pick-one row or counters. */
export function ModifierGroupField(props: ModifierGroupFieldProps) {
  const { group, variantId, choices } = props;
  const rule = effectiveModifierGroupRule(group, variantId);
  if (rule.hidden) return null;
  const single = isSingleChoice(group, variantId);
  return (
    <fieldset className="pos-group">
      <legend className="pos-group__legend pos-wrap">
        {group.name}
        <span className="pos-group__rule">
          {limitText(rule.minSelect, rule.maxSelect)}
          {rule.minSelect > 0 ? ` · ${P.required}` : ""}
        </span>
      </legend>
      <ul className="pos-options">
        {group.options.map((option) => {
          const units = unitsOf(choices, option.id);
          const price = option.priceDelta === 0n ? "" : ` +${formatVnd(option.priceDelta)}`;
          return (
            <li key={option.id} className="pos-option">
              <button
                type="button"
                className="pos-button pos-option__pick pos-wrap"
                aria-pressed={units > 0}
                onClick={() => props.onTap(option.id)}
              >
                {option.name}
                {price}
                {!single && units > 1 ? ` ×${units}` : ""}
              </button>
              {!single && group.allowDuplicates && units > 0 ? (
                <button
                  type="button"
                  className="pos-button"
                  aria-label={P.fewer(option.name)}
                  onClick={() => props.onFewer(option.id)}
                >
                  −
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
