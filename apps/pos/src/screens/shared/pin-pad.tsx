import { Delete } from "lucide-react";
import { vi } from "../../messages/vi";
import { Icon } from "./icon";
import { Alert } from "./screen-frame";

/** The server's own rule; checked here only to spare a request that cannot succeed. */
export const PIN_FORMAT = /^\d{4,6}$/;
const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
const MAX_PIN = 6;

/** What was typed, as a PIN: digits only, at most six. */
export const cleanPin = (typed: string) => typed.replace(/\D/g, "").slice(0, 6);

export interface PinPadProps {
  pin: string;
  onPin(pin: string): void;
  error: string | null;
  busy: boolean;
  submitLabel: string;
  busyLabel: string;
}

/**
 * The PIN field and its keypad, inside a form whose submit is the pad's last key: the
 * staff sign-in and a manager's approval are typed the same way.
 */
export function PinPad({ pin, onPin, error, busy, submitLabel, busyLabel }: PinPadProps) {
  return (
    <>
      <div className="pos-pin-field" data-wrong={error === null ? undefined : ""}>
        <input
          className="pos-input pos-input--pin"
          type="password"
          name="pin"
          inputMode="numeric"
          autoComplete="off"
          aria-label={vi.staff.pinLabel}
          aria-invalid={error === null ? undefined : true}
          value={pin}
          onChange={(event) => onPin(cleanPin(event.target.value))}
        />
        <button
          type="button"
          className="pos-button pos-button--quiet pos-pin-field__back"
          aria-label={vi.staff.backspace}
          disabled={pin === ""}
          onClick={() => onPin(pin.slice(0, -1))}
        >
          <Icon of={Delete} size={26} />
        </button>
      </div>
      {/* One dot per digit typed (a PIN is 4 to 6): the tap is seen even by someone not reading the field. */}
      <div className="pos-pin-dots" aria-hidden="true">
        {Array.from({ length: MAX_PIN }, (_, at) => (
          <span key={at} className="pos-pin-dots__dot" data-filled={at < pin.length ? "" : undefined} />
        ))}
      </div>
      <Alert message={error} />
      <div className="pos-pin-pad">
        {DIGITS.map((digit) => (
          <button
            key={digit}
            type="button"
            className="pos-button"
            onClick={() => onPin(cleanPin(pin + digit))}
          >
            {digit}
          </button>
        ))}
        <button type="button" className="pos-button pos-pin-pad__clear" onClick={() => onPin("")}>
          {vi.staff.clear}
        </button>
        <button type="button" className="pos-button" onClick={() => onPin(cleanPin(pin + "0"))}>
          0
        </button>
        <button type="submit" className="pos-button pos-button--primary" disabled={busy}>
          {busy ? busyLabel : submitLabel}
        </button>
      </div>
    </>
  );
}
