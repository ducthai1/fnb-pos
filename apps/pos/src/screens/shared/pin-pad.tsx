import { vi } from "../../messages/vi";
import { Alert } from "./screen-frame";

/** The server's own rule; checked here only to spare a request that cannot succeed. */
export const PIN_FORMAT = /^\d{4,6}$/;
const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

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
      <input
        className="pos-input pos-input--pin"
        type="password"
        name="pin"
        inputMode="numeric"
        autoComplete="off"
        aria-label={vi.staff.pinLabel}
        value={pin}
        onChange={(event) => onPin(cleanPin(event.target.value))}
      />
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
        <button type="button" className="pos-button" onClick={() => onPin("")}>
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
