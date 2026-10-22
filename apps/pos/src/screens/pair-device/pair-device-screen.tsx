import { KeyRound, MonitorSmartphone } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import type { ApiResult } from "../../features/api/api-result";
import { failureMessage } from "../../features/api/failure-message";
import { vi } from "../../messages/vi";
import type { DeviceCredential } from "../../shell-bridge/device-credential-store";
import { Icon } from "../shared/icon";
import { Alert, ScreenFrame } from "../shared/screen-frame";

export const PAIRING_CODE_LENGTH = 8;

/** The backoffice may show the code as "ABCD-EFGH"; case, spaces and dashes do not count. */
export const normalizeTypedCode = (typed: string): string =>
  typed.toUpperCase().replace(/[\s-]/g, "");

export interface PairDeviceScreenProps {
  pair(input: { code: string; deviceName: string }): Promise<ApiResult<DeviceCredential>>;
  /** Keeps the credential; the till moves on once it resolves. */
  onPaired(credential: DeviceCredential): Promise<void>;
  /** A code that came in a pairing link: filled in and sent once, as if typed. */
  linkedCode?: string | null;
}

export function PairDeviceScreen({ pair, onPaired, linkedCode = null }: PairDeviceScreenProps) {
  const [code, setCode] = useState(linkedCode ?? "");
  const [deviceName, setDeviceName] = useState<string>(vi.pairing.deviceNameDefault);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const typedCode = normalizeTypedCode(code);
    const name = deviceName.trim();
    // A code of the wrong length is refused here: sending it would only spend a request.
    if (typedCode.length !== PAIRING_CODE_LENGTH) return setError(vi.pairing.codeIncomplete);
    if (name === "") return setError(vi.pairing.deviceNameMissing);
    setBusy(true);
    setError(null);
    const result = await pair({ code: typedCode, deviceName: name });
    if (!result.ok) {
      setBusy(false);
      return setError(failureMessage(result));
    }
    try {
      await onPaired(result.value);
    } catch {
      setBusy(false);
      setError(vi.errors.unknown);
    }
  }

  // A linked code is sent once on arrival; a refusal stays on screen to be corrected by hand.
  const linkSent = useRef(false);
  useEffect(() => {
    if (linkedCode === null || linkSent.current) return;
    linkSent.current = true;
    void submit();
    // Only the code the screen opened with, once: later typing is sent by the button.
  }, []);

  return (
    <ScreenFrame title={vi.pairing.title} width="narrow">
      <form className="pos-form pos-signin" onSubmit={submit} noValidate>
        <div className="pos-signin__lead">
          <span className="pos-signin__mark">
            <Icon of={MonitorSmartphone} size={26} />
          </span>
          <p className="pos-hint">{vi.pairing.hint}</p>
        </div>
        <label className="pos-field">
          <span className="pos-field__label">{vi.pairing.codeLabel}</span>
          <input
            className="pos-input pos-input--code"
            name="pairing-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={16}
          />
        </label>
        <label className="pos-field">
          <span className="pos-field__label">{vi.pairing.deviceNameLabel}</span>
          <input
            className="pos-input"
            name="device-name"
            value={deviceName}
            onChange={(event) => setDeviceName(event.target.value)}
            maxLength={80}
          />
        </label>
        <Alert message={error} />
        <button
          type="submit"
          className="pos-button pos-button--primary pos-button--block"
          disabled={busy}
        >
          <Icon of={KeyRound} />
          {busy ? vi.pairing.submitting : vi.pairing.submit}
        </button>
      </form>
    </ScreenFrame>
  );
}
