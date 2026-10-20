"use client";

import { useState } from "react";
import type { ApiFailure } from "../../lib/api/api-result";
import { dayCloseBlockersOf } from "../../lib/day-close/day-close-refusal";
import { failureMessage, isSignedOut } from "../../lib/errors/failure-message";
import { formatBusinessDate } from "../../lib/format/business-day";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { useSession } from "../shell/session-context";
import { ConfirmPanel } from "../ui/confirm-panel";
import { ErrorNotice } from "../ui/error-notice";
import { DayCloseBlockersList } from "./day-status-lists";

const T = vi.dayClose;

/**
 * The close button of a day not closed yet: a second, confirming tap, then the server's
 * answer. A refusal shows its sentence and the list it came with (the shifts, drafts or
 * invoices still open at that moment), next to the button that was refused.
 */
export function CloseDayPanel({
  branchId,
  businessDate,
  onClosed,
  onRefused,
}: {
  branchId: string;
  businessDate: string;
  onClosed: () => void;
  /** The day's status may have moved since it was read: the page reads it again. */
  onRefused: () => void;
}) {
  const api = useApi();
  const { user, signedOut } = useSession();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<ApiFailure | null>(null);
  const shown = formatBusinessDate(businessDate);

  if (!user.permissionKeys.includes("accept_close_difference")) {
    return <p className="bo-muted bo-wrap">{T.needsKey}</p>;
  }

  async function close() {
    setBusy(true);
    setRefusal(null);
    const result = await api.closeDay(branchId, businessDate);
    setBusy(false);
    setConfirming(false);
    if (result.ok) return onClosed();
    if (isSignedOut(result)) return signedOut();
    setRefusal(result);
    onRefused();
  }

  const blockers = refusal === null ? null : dayCloseBlockersOf(refusal);
  return (
    <div className="bo-stack" data-close-day>
      {refusal !== null && (
        <div className="bo-card bo-stack" data-close-refused>
          <ErrorNotice message={failureMessage(refusal)} />
          {blockers !== null && <DayCloseBlockersList blockers={blockers} />}
        </div>
      )}
      {confirming ? (
        <ConfirmPanel
          title={T.closeTitle(shown)}
          hint={T.closeHint}
          confirmLabel={T.close}
          busyLabel={T.closing}
          busy={busy}
          error={null}
          onConfirm={() => void close()}
          onCancel={() => setConfirming(false)}
        />
      ) : (
        <button type="button" className="bo-button bo-button--primary" onClick={() => setConfirming(true)}>
          {T.close}
        </button>
      )}
    </div>
  );
}
