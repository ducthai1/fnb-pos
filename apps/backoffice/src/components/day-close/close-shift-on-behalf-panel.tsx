"use client";

import { formatVnd, negateVnd, subtractVnd, vnd } from "@fnb/domain";
import { useState } from "react";
import type { DayOpenShift } from "../../lib/api/day-close-api";
import { failureMessage, isSignedOut } from "../../lib/errors/failure-message";
import { parseAmountText } from "../../lib/format/amount-text";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { useSession } from "../shell/session-context";
import { ConfirmPanel } from "../ui/confirm-panel";
import { TextField } from "../ui/text-field";

const T = vi.dayClose;

/** "Thừa 1.000 ₫…", "Thiếu…" or "Khớp…" for a counted minus expected difference. */
export function differenceSentence(difference: number): string {
  const amount = vnd(BigInt(difference));
  return T.difference(difference, formatVnd(difference < 0 ? negateVnd(amount) : amount));
}

const STALE = new Set(["API_SHIFT_VERSION_CONFLICT", "API_SHIFT_ALREADY_CLOSED", "API_SHIFT_NOT_FOUND"]);

/**
 * The manager's count of a revoked till's drawer, and the close it settles. The difference
 * against the server's expected cash shows as the total is typed; the close names the
 * version the page read, so cash the till sent meanwhile is refused and the page reads the
 * shift again rather than closing on an old figure.
 */
export function CloseShiftOnBehalfPanel({
  shift,
  onClosed,
  onStale,
  onCancel,
}: {
  shift: DayOpenShift;
  onClosed: (message: string) => void;
  /** The shift moved under the manager (new cash, or closed by someone): read it again. */
  onStale: () => void;
  onCancel: () => void;
}) {
  const api = useApi();
  const { signedOut } = useSession();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const counted = parseAmountText(text);
  const name = T.tillName(shift.deviceName);
  const difference = counted === null ? null : subtractVnd(counted, vnd(BigInt(shift.expectedCash)));

  async function close() {
    if (counted === null) return;
    setBusy(true);
    setError(null);
    const result = await api.closeShiftOnBehalf(shift.id, Number(counted), shift.version);
    setBusy(false);
    if (!result.ok) {
      if (isSignedOut(result)) return signedOut();
      setError(failureMessage(result));
      if (result.code !== null && STALE.has(result.code)) onStale();
      return;
    }
    onClosed(T.closedOnBehalfDone(name, differenceSentence(result.value.difference)));
  }

  return (
    <ConfirmPanel
      title={T.closeOnBehalfTitle(name)}
      hint={T.closeOnBehalfHint}
      confirmLabel={T.closeOnBehalf}
      busyLabel={T.closingOnBehalf}
      busy={busy}
      error={error}
      onConfirm={() => void close()}
      onCancel={onCancel}
    >
      <div className="bo-stack bo-on-behalf" data-close-on-behalf={shift.id}>
        <p className="bo-on-behalf__expected bo-wrap">{T.expectedLine(formatVnd(vnd(BigInt(shift.expectedCash))))}</p>
        <TextField
          label={T.countedLabel}
          value={text}
          inputMode="numeric"
          autoComplete="off"
          hint={T.countedHint}
          error={counted === null ? T.countedInvalid : undefined}
          onChange={setText}
        />
        {difference !== null && (
          <p className="bo-on-behalf__difference bo-wrap" data-difference={difference === 0n ? "none" : difference > 0n ? "over" : "short"}>
            {differenceSentence(Number(difference))}
          </p>
        )}
      </div>
    </ConfirmPanel>
  );
}
