import { ChevronLeft } from "lucide-react";
import { type FormEvent, useState } from "react";
import type { ApiResult } from "../../features/api/api-result";
import { failureMessage } from "../../features/api/failure-message";
import type { StaffSession } from "../../features/api/pos-api";
import type { BootstrapStaff } from "../../features/bootstrap/bootstrap-source";
import { vi } from "../../messages/vi";
import { Icon } from "../shared/icon";
import { PIN_FORMAT, PinPad } from "../shared/pin-pad";
import { ScreenFrame } from "../shared/screen-frame";
import { StaffAvatar } from "../shared/staff-avatar";

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
    <ScreenFrame title={vi.staff.pinTitle} stage="narrow">
      <form className="pos-form pos-pin pos-gate__body" onSubmit={submit} noValidate>
        <div className="pos-signin__who">
          <StaffAvatar id={staff.id} name={staff.displayName} size="lg" />
          <p className="pos-signin__name">{vi.staff.pinFor(staff.displayName)}</p>
        </div>
        <PinPad
          pin={pin}
          onPin={setPin}
          error={error}
          busy={busy}
          submitLabel={vi.staff.submit}
          busyLabel={vi.staff.submitting}
        />
        <button type="button" className="pos-button pos-button--quiet" onClick={onBack}>
          <Icon of={ChevronLeft} />
          {vi.staff.back}
        </button>
      </form>
    </ScreenFrame>
  );
}
