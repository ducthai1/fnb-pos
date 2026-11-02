import { KeyRound, SendHorizontal } from "lucide-react";
import { type FormEvent, useState } from "react";
import { vi } from "../../messages/vi";
import { Icon } from "../shared/icon";
import { Alert } from "../shared/screen-frame";
import { PAIRING_CODE_LENGTH, normalizeTypedCode } from "./pair-device-screen";

const T = vi.revoked.flush;

/**
 * The code a manager reads out from the backoffice, and the one press that sends the till's
 * unsent commands under it. `onFlush` answers the sentence to show when the server did not
 * take everything (the code, the network), or null when the outbox is empty.
 */
export function RevokedFlushPanel({
  waiting,
  onFlush,
  onBack,
}: {
  waiting: number;
  onFlush(code: string): Promise<string | null>;
  onBack(): void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const typed = normalizeTypedCode(code);
    if (typed.length !== PAIRING_CODE_LENGTH) return setError(T.codeIncomplete);
    setBusy(true);
    setError(null);
    const failure = await onFlush(typed);
    setBusy(false);
    setError(failure);
  }

  return (
    <form className="pos-form pos-gate__flush" onSubmit={submit} noValidate aria-label={T.title}>
      <p className="pos-gate__fine-print">{T.hint}</p>
      <label className="pos-field">
        <span className="pos-field__label">{T.codeLabel}</span>
        <input
          className="pos-input pos-input--code"
          name="flush-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={16}
          aria-invalid={error === T.codeIncomplete ? true : undefined}
        />
      </label>
      <Alert message={error} />
      <button
        type="submit"
        className="pos-button pos-button--primary pos-button--block pos-gate__action"
        disabled={busy}
      >
        <Icon of={busy ? KeyRound : SendHorizontal} />
        {busy ? T.sending : T.submit(waiting)}
      </button>
      <button type="button" className="pos-button pos-button--block" disabled={busy} onClick={onBack}>
        {T.back}
      </button>
    </form>
  );
}
