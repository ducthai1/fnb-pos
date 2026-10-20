import { type FormEvent, useState } from "react";
import type { ApiResult } from "../../features/api/api-result";
import { failureMessage } from "../../features/api/failure-message";
import type { StaffSession } from "../../features/api/pos-api";
import type { BootstrapStaff } from "../../features/bootstrap/bootstrap-source";
import { vi } from "../../messages/vi";
import { Alert, ScreenFrame } from "../shared/screen-frame";

/** The server's own rule; checked here only to spare a request that cannot succeed. */
const PIN_FORMAT = /^\d{4,6}$/;
const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

export interface PinEntryProps {
  staff: BootstrapStaff;
  signIn(staffId: string, pin: string): Promise<ApiResult<StaffSession>>;
  onSignedIn(staff: BootstrapStaff, session: StaffSession): void;
  onBack(): void;
}

export function PinEntry({ staff, signIn, onSignedIn, onBack }: PinEntryProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const typed = (next: string) => setPin(next.replace(/\D/g, "").slice(0, 6));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!PIN_FORMAT.test(pin)) return setError(vi.staff.pinIncomplete);
    setBusy(true);
    setError(null);
    const result = await signIn(staff.id, pin);
    if (result.ok) return onSignedIn(staff, result.value);
    // A wrong PIN is cleared so the next try starts from nothing, not from a guess.
    setPin("");
    setBusy(false);
    setError(failureMessage(result));
  }

  return (
    <ScreenFrame title={vi.staff.pinTitle}>
      <p className="pos-hint pos-wrap">{vi.staff.pinFor(staff.displayName)}</p>
      <form className="pos-form pos-pin" onSubmit={submit} noValidate>
        <input
          className="pos-input pos-input--pin"
          type="password"
          name="pin"
          inputMode="numeric"
          autoComplete="off"
          aria-label={vi.staff.pinLabel}
          value={pin}
          onChange={(event) => typed(event.target.value)}
        />
        <Alert message={error} />
        <div className="pos-pin-pad">
          {DIGITS.map((digit) => (
            <button
              key={digit}
              type="button"
              className="pos-button"
              onClick={() => typed(pin + digit)}
            >
              {digit}
            </button>
          ))}
          <button type="button" className="pos-button" onClick={() => setPin("")}>
            {vi.staff.clear}
          </button>
          <button type="button" className="pos-button" onClick={() => typed(pin + "0")}>
            0
          </button>
          <button type="submit" className="pos-button pos-button--primary" disabled={busy}>
            {busy ? vi.staff.submitting : vi.staff.submit}
          </button>
        </div>
        <button type="button" className="pos-button pos-button--quiet" onClick={onBack}>
          {vi.staff.back}
        </button>
      </form>
    </ScreenFrame>
  );
}
