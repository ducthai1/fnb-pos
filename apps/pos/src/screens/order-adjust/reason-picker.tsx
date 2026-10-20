import type { ReasonCode } from "../../features/order-adjust/reason-codes";
import { vi } from "../../messages/vi";

/** One reason from the shop's list, chosen by tapping it; the chosen one reads as pressed. */
export function ReasonPicker(props: {
  reasons: readonly ReasonCode[];
  chosen: ReasonCode | null;
  onChoose(reason: ReasonCode): void;
}) {
  return (
    <fieldset className="pos-group">
      <legend className="pos-group__legend">{vi.adjust.reason}</legend>
      <ul className="pos-choices">
        {props.reasons.map((reason) => (
          <li key={reason}>
            <button
              type="button"
              className="pos-button pos-wrap"
              aria-pressed={props.chosen === reason}
              onClick={() => props.onChoose(reason)}
            >
              {vi.reasons[reason]}
            </button>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
