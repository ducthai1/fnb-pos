import { type Vnd, formatVnd } from "@fnb/domain";
import { type ReactNode, useState } from "react";
import {
  type ChosenReason,
  REFUND_REASONS,
  type ReasonCode,
  chosenReason,
} from "../../features/order-adjust/reason-codes";
import { REFUND_METHODS, type RefundMethod } from "../../features/refund/refund-command";
import type { RefundSelection, RefundableLine } from "../../features/refund/refund-plan";
import { vi } from "../../messages/vi";
import { ReasonPicker } from "../order-adjust/reason-picker";
import { QuantityStepper } from "../sale/quantity-stepper";
import { Alert, ScreenFrame } from "../shared/screen-frame";

const R = vi.refund;

export type RefundPreview = { readonly payout: Vnd } | { readonly refused: string };

export interface RefundScreenProps {
  header: ReactNode;
  orderNo: number;
  lines: readonly RefundableLine[];
  /** What the domain gives back for the units chosen, or why it cannot. */
  preview(selection: RefundSelection): RefundPreview;
  onConfirm(
    selection: RefundSelection,
    reason: ChosenReason,
    method: RefundMethod,
  ): Promise<string | null>;
  /** Whether the customer paid the sale by QR transfer: only then can it go back by transfer. */
  transferAllowed: boolean;
  onBack(): void;
}

/** Which items come back and how many, what the customer gets, how, and why. */
export function RefundScreen(props: RefundScreenProps) {
  const [chosen, setChosen] = useState<ReadonlyMap<string, number>>(new Map());
  const [method, setMethod] = useState<RefundMethod>(REFUND_METHODS.cash);
  const [code, setCode] = useState<ReasonCode | null>(null);
  const [note, setNote] = useState("");
  const reason = chosenReason(code, note);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const any = [...chosen.values()].some((units) => units > 0);
  const preview = any ? props.preview(chosen) : null;
  const payout = preview !== null && "payout" in preview ? preview.payout : null;
  const nothingLeft = props.lines.every((line) => line.refundable === 0);
  return (
    <ScreenFrame
      title={R.title(props.orderNo)}
      dock={
        <>
          <Alert message={error} />
          <div className="pos-actions pos-actions--split">
            <button type="button" className="pos-button" onClick={props.onBack}>
              {R.backToHistory}
            </button>
            <button
              type="button"
              className="pos-button pos-button--primary"
              disabled={busy || payout === null || reason === null}
              onClick={() => {
                if (reason === null) return;
                setBusy(true);
                void props.onConfirm(chosen, reason, method).then((refused) => {
                  setBusy(false);
                  setError(refused);
                });
              }}
            >
              {payout === null ? R.nothingChosen : R.confirm(formatVnd(payout))}
            </button>
          </div>
        </>
      }
    >
      {props.header}
      <p className="pos-hint">{nothingLeft ? R.nothingLeft : R.hint}</p>
      <ul className="pos-list">
        {props.lines.map(({ item, sold, refundable }) => (
          <li key={item.id} className="pos-card pos-refund-line">
            <span className="pos-wrap">{item.nameSnapshot}</span>
            <span className="pos-hint">{R.line(sold, refundable)}</span>
            <QuantityStepper
              label={R.units(item.nameSnapshot)}
              name={item.nameSnapshot}
              value={chosen.get(item.id) ?? 0}
              min={0}
              max={refundable}
              onChange={(units) => setChosen(new Map([...chosen, [item.id, units]]))}
            />
          </li>
        ))}
      </ul>
      {preview !== null && "refused" in preview ? <Alert message={preview.refused} /> : null}
      {payout === null ? null : (
        <p className="pos-total" data-refund-payout={String(payout)}>
          {R.amount(formatVnd(payout))}
        </p>
      )}
      <fieldset className="pos-group">
        <legend className="pos-group__legend">{R.method}</legend>
        <ul className="pos-choices">
          {Object.values(REFUND_METHODS)
            .filter((each) => props.transferAllowed || each !== REFUND_METHODS.bankTransfer)
            .map((each) => (
              <li key={each}>
                <button
                  type="button"
                  className="pos-button"
                  aria-pressed={method === each}
                  onClick={() => setMethod(each)}
                >
                  {R.methods[each]}
                </button>
              </li>
            ))}
        </ul>
        <p className="pos-hint">{method === REFUND_METHODS.cash ? R.cashNote : R.transferNote}</p>
      </fieldset>
      <ReasonPicker
        reasons={REFUND_REASONS}
        chosen={code}
        onChoose={setCode}
        note={note}
        onNote={setNote}
      />
    </ScreenFrame>
  );
}
