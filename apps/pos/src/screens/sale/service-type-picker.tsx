import type { CounterOrder } from "../../features/order/counter-order";
import { MAX_TABLE_TAG_LENGTH } from "../../features/order/counter-order";
import { vi } from "../../messages/vi";

const S = vi.sale;

/**
 * Takeaway by default at the counter; dine-in takes the table number the drinks are
 * brought to. Choosing a table on the floor plan belongs to table service, not here.
 */
export function ServiceTypePicker({
  order,
  onChange,
}: {
  order: CounterOrder;
  onChange(serviceType: CounterOrder["serviceType"], tableTag: string): void;
}) {
  const tag = order.tableTag ?? "";
  return (
    <fieldset className="pos-group">
      <legend className="pos-group__legend">{S.serviceType}</legend>
      <div className="pos-tabs" role="group">
        <button
          type="button"
          className="pos-tab"
          aria-pressed={order.serviceType === "takeaway"}
          onClick={() => onChange("takeaway", "")}
        >
          {S.takeaway}
        </button>
        <button
          type="button"
          className="pos-tab"
          aria-pressed={order.serviceType === "dine_in"}
          onClick={() => onChange("dine_in", tag)}
        >
          {S.dineIn}
        </button>
      </div>
      {order.serviceType === "dine_in" ? (
        <label className="pos-field">
          <span className="pos-field__label">{S.tableTag}</span>
          <input
            className="pos-input"
            inputMode="text"
            maxLength={MAX_TABLE_TAG_LENGTH}
            placeholder={S.tableTagHint}
            defaultValue={tag}
            onBlur={(event) => onChange("dine_in", event.target.value)}
          />
        </label>
      ) : null}
    </fieldset>
  );
}
