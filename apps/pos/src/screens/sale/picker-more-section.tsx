import { MAX_LINE_QUANTITY } from "../../features/order/counter-order";
import { vi } from "../../messages/vi";
import { QuantityStepper } from "./quantity-stepper";
import { QuickNotes } from "./quick-notes";

const P = vi.sale.picker;

/** How many, a note and the quick notes: the foot of every picker. */
export function PickerMoreSection(props: {
  name: string;
  /** null: a weighed line is one weighing, so it has no quantity to count. */
  quantity: number | null;
  onQuantity(quantity: number): void;
  note: string;
  onNote(note: string): void;
}) {
  return (
    <section className="pos-card pos-picker__more">
      {props.quantity === null ? null : (
        <div className="pos-picker__quantity">
          <span className="pos-field__label">{P.quantity}</span>
          <QuantityStepper
            label={P.quantity}
            name={props.name}
            value={props.quantity}
            max={MAX_LINE_QUANTITY}
            onChange={props.onQuantity}
          />
        </div>
      )}
      <label className="pos-field">
        <span className="pos-field__label">{vi.sale.note}</span>
        <textarea
          className="pos-input pos-note"
          rows={2}
          maxLength={500}
          placeholder={P.notePlaceholder}
          value={props.note}
          onChange={(event) => props.onNote(event.target.value)}
        />
      </label>
      <QuickNotes note={props.note} onChange={props.onNote} />
    </section>
  );
}
