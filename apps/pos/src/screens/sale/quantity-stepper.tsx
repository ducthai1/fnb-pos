import { vi } from "../../messages/vi";

export interface QuantityStepperProps {
  label: string;
  /** What is counted, for the buttons' names ("Bớt một Cà phê sữa"). */
  name: string;
  value: number;
  max: number;
  onChange(value: number): void;
}

/** − n +, from 1 to max: big targets, no typing needed for the usual one or two. */
export function QuantityStepper({ label, name, value, max, onChange }: QuantityStepperProps) {
  return (
    <div className="pos-stepper" role="group" aria-label={label}>
      <button
        type="button"
        className="pos-button"
        aria-label={vi.sale.less(name)}
        disabled={value <= 1}
        onClick={() => onChange(value - 1)}
      >
        −
      </button>
      <output className="pos-stepper__value" aria-label={vi.sale.lineQuantity(name)}>
        {value}
      </output>
      <button
        type="button"
        className="pos-button"
        aria-label={vi.sale.more(name)}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
    </div>
  );
}
