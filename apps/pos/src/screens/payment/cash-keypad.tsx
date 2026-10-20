import { Delete } from "lucide-react";
import { vi } from "../../messages/vi";
import { Icon } from "../shared/icon";

const T = vi.checkout.payment;
const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "000", "0"] as const;

/** At most the digits typedAmount reads; more would only be refused. */
export const MAX_TYPED_DIGITS = 11;

/** What a key does to the digits typed so far: add its digits, or take the last one off. */
export function pressKey(typed: string, key: (typeof DIGITS)[number] | "back"): string {
  const digits = typed.replace(/\D/g, "");
  if (key === "back") return digits.slice(0, -1);
  // A leading zero says nothing: "0" then "5" is 5, not 05.
  const next = (digits === "0" ? "" : digits) + key;
  const trimmed = next.replace(/^0+(?=\d)/, "");
  return trimmed.length > MAX_TYPED_DIGITS ? digits : trimmed;
}

/** Big keys for the amount the customer hands over, for a till without a keyboard. */
export function CashKeypad({ typed, onChange }: { typed: string; onChange(next: string): void }) {
  return (
    <div className="pos-keypad" role="group" aria-label={T.keypad}>
      {DIGITS.map((key) => (
        <button
          key={key}
          type="button"
          className="pos-keypad__key"
          onClick={() => onChange(pressKey(typed, key))}
        >
          {key}
        </button>
      ))}
      <button
        type="button"
        className="pos-keypad__key"
        aria-label={T.backspace}
        disabled={typed === ""}
        onClick={() => onChange(pressKey(typed, "back"))}
      >
        <Icon of={Delete} size={24} />
      </button>
    </div>
  );
}
