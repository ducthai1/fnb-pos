import { Minus, Plus } from "lucide-react";
import { vi } from "../../messages/vi";
import { Icon } from "../shared/icon";

export interface QuantityStepperProps {
  label: string;
  /** What is counted, for the buttons' names ("Bớt một Cà phê sữa"). */
  name: string;
  value: number;
  max: number;
  /** 1 unless nothing is a choice too (how many of an item to refund). */
  min?: number;
  onChange(value: number): void;
}

/** − n +, from min to max: big targets, no typing needed for the usual one or two. */
export function QuantityStepper({
  label,
  name,
  value,
  max,
  min = 1,
  onChange,
}: QuantityStepperProps) {
  return (
    <div className="pos-stepper" role="group" aria-label={label}>
      <button
        type="button"
        className="pos-button pos-stepper__step"
        aria-label={vi.sale.less(name)}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
      >
        <Icon of={Minus} />
      </button>
      <output className="pos-stepper__value" aria-label={vi.sale.lineQuantity(name)}>
        {value}
      </output>
      <button
        type="button"
        className="pos-button pos-stepper__step"
        aria-label={vi.sale.more(name)}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        <Icon of={Plus} />
      </button>
    </div>
  );
}
