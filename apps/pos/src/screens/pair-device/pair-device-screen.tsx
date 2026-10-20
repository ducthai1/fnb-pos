import { type FormEvent, useState } from "react";
import type { ApiResult } from "../../features/api/api-result";
import { failureMessage } from "../../features/api/failure-message";
import { vi } from "../../messages/vi";
import type { DeviceCredential } from "../../shell-bridge/device-credential-store";
import { Alert, ScreenFrame } from "../shared/screen-frame";

export const PAIRING_CODE_LENGTH = 8;

/** The backoffice may show the code as "ABCD-EFGH"; case, spaces and dashes do not count. */
export const normalizeTypedCode = (typed: string): string =>
  typed.toUpperCase().replace(/[\s-]/g, "");

export interface PairDeviceScreenProps {
  pair(input: { code: string; deviceName: string }): Promise<ApiResult<DeviceCredential>>;
  /** Keeps the credential; the till moves on once it resolves. */
  onPaired(credential: DeviceCredential): Promise<void>;
}

export function PairDeviceScreen({ pair, onPaired }: PairDeviceScreenProps) {
  const [code, setCode] = useState("");
  const [deviceName, setDeviceName] = useState<string>(vi.pairing.deviceNameDefault);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
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

  return (
    <ScreenFrame title={vi.pairing.title}>
      <p className="pos-hint">{vi.pairing.hint}</p>
      <form className="pos-form" onSubmit={submit} noValidate>
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
        <button type="submit" className="pos-button pos-button--primary" disabled={busy}>
          {busy ? vi.pairing.submitting : vi.pairing.submit}
        </button>
      </form>
    </ScreenFrame>
  );
}
