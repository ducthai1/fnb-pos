"use client";

import { type QrRefundMethod, QR_REFUND_METHODS } from "@fnb/contracts";
import { useId, useState } from "react";
import type { PaymentIntentSnapshot } from "../../lib/api/payments-api";
import { failureMessage, isSignedOut } from "../../lib/errors/failure-message";
import { vndText } from "../../lib/format/business-day";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { useSession } from "../shell/session-context";
import { ErrorNotice, SuccessNotice } from "../ui/error-notice";
import { TextField } from "../ui/text-field";

const T = vi.transfers;

const receivedText = (intent: PaymentIntentSnapshot) =>
  intent.receivedAmount === null ? "—" : vndText(intent.receivedAmount);

/**
 * Saying one QR's money went back to the customer: how and a note, then one tap. What the
 * server refuses (marked already, the money is a sale's after all) stays here, under the
 * form, with its reason; nothing is marked until the server says so.
 */
function HandBackPanel({
  intent,
  onDone,
  onCancel,
}: {
  intent: PaymentIntentSnapshot;
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const api = useApi();
  const { signedOut } = useSession();
  const titleId = useId();
  const [method, setMethod] = useState<QrRefundMethod | null>(null);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const missingNote = note.trim() === "";
    setNoteError(missingNote ? T.handBackNeedsNote : undefined);
    if (method === null) return setError(T.handBackChooseMethod);
    if (missingNote) return setError(null);
    setBusy(true);
    setError(null);
    const result = await api.handBackQrMoney(intent.id, { method, note: note.trim() });
    setBusy(false);
    if (!result.ok) {
      if (isSignedOut(result)) signedOut();
      return setError(failureMessage(result));
    }
    onDone(T.handedBack(intent.contentCode, vndText(result.value.amount)));
  }

  return (
    <div className="bo-card bo-confirm bo-stack" role="alertdialog" aria-labelledby={titleId}>
      <p id={titleId} className="bo-subtitle bo-wrap">
        {T.handBackTitle(intent.contentCode, receivedText(intent))}
      </p>
      <p className="bo-muted bo-wrap">{T.handBackHint}</p>
      <fieldset className="bo-fieldset">
        <legend>{T.handBackMethod}</legend>
        {QR_REFUND_METHODS.map((each) => (
          <label key={each} className="bo-field--inline">
            <input
              type="radio"
              name={`hand-back-${intent.id}`}
              checked={method === each}
              onChange={() => setMethod(each)}
            />
            {T.handBackMethods[each]}
          </label>
        ))}
      </fieldset>
      <TextField
        label={T.handBackNote}
        value={note}
        onChange={setNote}
        error={noteError}
        maxLength={500}
      />
      <ErrorNotice message={error} />
      <div className="bo-row">
        <button
          type="button"
          className="bo-button bo-button--danger"
          disabled={busy}
          onClick={() => void submit()}
        >
          {busy ? T.handingBack : T.handBackConfirm}
        </button>
        <button type="button" className="bo-button" disabled={busy} onClick={onCancel}>
          {vi.common.cancel}
        </button>
      </div>
    </div>
  );
}

/** Money the bank brought for a QR that no order uses: the customer is owed it back. */
export function RefundDueList({
  intents,
  onHandedBack,
}: {
  intents: readonly PaymentIntentSnapshot[];
  onHandedBack: () => void;
}) {
  const { user } = useSession();
  const mayHandBack = user.permissionKeys.includes("manage_settings");
  const [open, setOpen] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  return (
    <section className="bo-card bo-stack" aria-labelledby="refund-due-title" data-refund-due>
      <h2 id="refund-due-title" className="bo-subtitle">
        {T.refundTitle} ({intents.length})
      </h2>
      <p className="bo-muted bo-wrap">{T.refundHint}</p>
      <SuccessNotice message={done} />
      {intents.length > 0 && !mayHandBack && (
        <p className="bo-muted bo-wrap">{T.handBackNeedsKey}</p>
      )}
      {intents.length === 0 ? (
        <p className="bo-muted">{T.none}</p>
      ) : (
        <ul className="bo-day-list__items">
          {intents.map((intent) => (
            <li
              key={intent.id}
              className="bo-notice bo-notice--warn bo-wrap bo-stack"
              data-intent={intent.id}
            >
              <span>
                {T.refundRow(intent.contentCode, receivedText(intent), vndText(intent.amount))}
              </span>
              {mayHandBack && open !== intent.id && (
                <button
                  type="button"
                  className="bo-button"
                  onClick={() => {
                    setDone(null);
                    setOpen(intent.id);
                  }}
                >
                  {T.handBack}
                </button>
              )}
              {mayHandBack && open === intent.id && (
                <HandBackPanel
                  intent={intent}
                  onCancel={() => setOpen(null)}
                  onDone={(message) => {
                    setOpen(null);
                    setDone(message);
                    onHandedBack();
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
