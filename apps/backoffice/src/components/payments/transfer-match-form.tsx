"use client";

import { useState } from "react";
import type { UnmatchedPayments } from "../../lib/api/payments-api";
import { failureMessage, isSignedOut } from "../../lib/errors/failure-message";
import { vndText } from "../../lib/format/business-day";
import { formatDateTime } from "../../lib/format/format-time";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { useSession } from "../shell/session-context";
import { ConfirmPanel } from "../ui/confirm-panel";
import { ErrorNotice, SuccessNotice } from "../ui/error-notice";

const T = vi.transfers;

function Choices({ legend, name, choices, chosen, onChoose }: {
  legend: string;
  name: string;
  choices: readonly { id: string; label: string }[];
  chosen: string | null;
  onChoose: (id: string) => void;
}) {
  return (
    <fieldset className="bo-fieldset">
      <legend>{legend}</legend>
      {choices.length === 0 && <p className="bo-muted">{T.none}</p>}
      {choices.map((choice) => (
        <label key={choice.id} className="bo-field--inline bo-wrap" data-choice={choice.id}>
          <input type="radio" name={name} checked={chosen === choice.id} onChange={() => onChoose(choice.id)} />
          {choice.label}
        </label>
      ))}
    </fieldset>
  );
}

/**
 * Matching a transfer to the QR it pays, by hand: one of each is chosen, a second tap
 * confirms, and a refusal (the QR's order paid another way, say, so the money is owed back)
 * stays in the confirmation with its reason.
 */
export function TransferMatchForm({ payments, onMatched }: { payments: UnmatchedPayments; onMatched: () => void }) {
  const api = useApi();
  const { user, signedOut } = useSession();
  const [transferId, setTransferId] = useState<string | null>(null);
  const [intentId, setIntentId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const transfer = payments.transfers.find((each) => each.id === transferId) ?? null;
  const intent = payments.openIntents.find((each) => each.id === intentId) ?? null;
  const mayMatch = user.permissionKeys.includes("manage_settings");

  async function match() {
    if (transfer === null || intent === null) return;
    setBusy(true);
    setError(null);
    const result = await api.matchTransfer(transfer.id, intent.id);
    setBusy(false);
    if (!result.ok) {
      if (isSignedOut(result)) signedOut();
      return setError(failureMessage(result));
    }
    setConfirming(false);
    setTransferId(null);
    setIntentId(null);
    setDone(T.matched(intent.contentCode));
    onMatched();
  }

  return (
    <div className="bo-card bo-stack">
      <Choices
        legend={T.transfersTitle}
        name="transfer"
        chosen={transferId}
        onChoose={setTransferId}
        choices={payments.transfers.map((each) => ({
          id: each.id,
          label: T.transfer(vndText(each.amount), each.content, formatDateTime(each.occurredAt)),
        }))}
      />
      <Choices
        legend={T.intentsTitle}
        name="intent"
        chosen={intentId}
        onChoose={setIntentId}
        choices={payments.openIntents.map((each) => ({
          id: each.id,
          label: `${T.intent(each.contentCode, vndText(each.amount), formatDateTime(each.expiresAt))} (${T.statuses[each.status] ?? each.status})`,
        }))}
      />
      <SuccessNotice message={done} />
      {!mayMatch && <p className="bo-muted bo-wrap">{T.needsKey}</p>}
      {mayMatch && confirming && transfer !== null && intent !== null && (
        <ConfirmPanel
          title={T.matchTitle(vndText(transfer.amount), intent.contentCode)}
          hint={T.matchHint}
          confirmLabel={T.match}
          busyLabel={T.matching}
          busy={busy}
          error={error}
          onConfirm={() => void match()}
          onCancel={() => {
            setConfirming(false);
            setError(null);
          }}
        />
      )}
      {mayMatch && !confirming && (
        <>
          <ErrorNotice message={error} />
          <button
            type="button"
            className="bo-button bo-button--primary"
            onClick={() => {
              setDone(null);
              if (transfer === null || intent === null) return setError(T.chooseBoth);
              setError(null);
              setConfirming(true);
            }}
          >
            {T.match}
          </button>
        </>
      )}
    </div>
  );
}
