"use client";

import { type QrRefundMethod, QR_REFUND_METHODS } from "@fnb/contracts";
import { useState } from "react";
import type { UnmatchedPayments } from "../../lib/api/payments-api";
import { failureMessage, isSignedOut } from "../../lib/errors/failure-message";
import { vndText } from "../../lib/format/business-day";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { useSession } from "../shell/session-context";
import { SuccessNotice } from "../ui/error-notice";
import { ConfirmPanel } from "../ui/confirm-panel";
import { SelectField } from "../ui/select-field";
import { TextField } from "../ui/text-field";

const T = vi.transfers;

type OwedIntent = UnmatchedPayments["refundDue"][number];
type OpenShift = NonNullable<UnmatchedPayments["openShifts"]>[number];

const shiftText = (shift: OpenShift) =>
  T.handBackShiftOption(
    shift.deviceName ?? T.handBackShiftNoDevice,
    shift.openedByName,
    new Date(shift.openedAt).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }),
  );

const receivedText = (intent: OwedIntent) =>
  intent.receivedAmount === null ? "—" : vndText(intent.receivedAmount);

/** What goes back: the excess once a sale counts the QR, else all the bank brought. */
const owedText = (intent: OwedIntent) =>
  intent.owedAmount === undefined ? receivedText(intent) : vndText(intent.owedAmount);

const rowText = (intent: OwedIntent) =>
  intent.owedAmount !== undefined && intent.owedAmount !== intent.receivedAmount
    ? T.refundRowExcess(
        intent.contentCode,
        receivedText(intent),
        vndText(intent.amount),
        owedText(intent),
      )
    : T.refundRow(intent.contentCode, receivedText(intent), vndText(intent.amount));

/**
 * Saying one QR's money went back to the customer: how and a note, then one tap. What the
 * server refuses (marked already, the money is a sale's after all) stays here, under the
 * form, with its reason; nothing is marked until the server says so.
 */
function HandBackPanel({
  intent,
  openShifts,
  onDone,
  onCancel,
}: {
  intent: OwedIntent;
  openShifts: readonly OpenShift[];
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const api = useApi();
  const { signedOut } = useSession();
  const [method, setMethod] = useState<QrRefundMethod | null>(null);
  const [note, setNote] = useState("");
  const [shiftId, setShiftId] = useState<string>(openShifts[0]?.id ?? "");
  const fromDrawer = method === "cash_from_drawer";
  const [noteError, setNoteError] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const missingNote = note.trim() === "";
    setNoteError(missingNote ? T.handBackNeedsNote : undefined);
    if (method === null) return setError(T.handBackChooseMethod);
    if (fromDrawer && shiftId === "") return setError(T.handBackChooseShift);
    if (missingNote) return setError(null);
    setBusy(true);
    setError(null);
    const body = { method, note: note.trim(), ...(fromDrawer ? { fromShiftId: shiftId } : {}) };
    const result = await api.handBackQrMoney(intent.id, body);
    setBusy(false);
    if (!result.ok) {
      if (isSignedOut(result)) signedOut();
      return setError(failureMessage(result));
    }
    onDone(T.handedBack(intent.contentCode, vndText(result.value.amount)));
  }

  return (
    <ConfirmPanel
      title={T.handBackTitle(intent.contentCode, owedText(intent))}
      hint={T.handBackHint}
      confirmLabel={T.handBackConfirm}
      busyLabel={T.handingBack}
      busy={busy}
      error={error}
      onConfirm={() => void submit()}
      onCancel={onCancel}
    >
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
      {!fromDrawer ? null : openShifts.length === 0 ? (
        <p className="bo-muted bo-wrap">{T.handBackNoOpenShift}</p>
      ) : (
        <>
          <SelectField
            label={T.handBackShift}
            value={shiftId}
            choices={openShifts.map((shift) => ({ value: shift.id, label: shiftText(shift) }))}
            onChange={setShiftId}
          />
          <p className="bo-muted bo-wrap">{T.handBackFromDrawerHint}</p>
        </>
      )}
      <TextField
        label={T.handBackNote}
        value={note}
        onChange={setNote}
        error={noteError}
        maxLength={500}
      />
    </ConfirmPanel>
  );
}

/** Money the bank brought for a QR that no order uses: the customer is owed it back. */
export function RefundDueList({
  intents,
  openShifts = [],
  onHandedBack,
}: {
  intents: readonly OwedIntent[];
  openShifts?: readonly OpenShift[];
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
              <span>{rowText(intent)}</span>
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
                  openShifts={openShifts}
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
