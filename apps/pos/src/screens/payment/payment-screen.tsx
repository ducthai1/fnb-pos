import { type Vnd, ZERO_VND, compareVnd, formatVnd } from "@fnb/domain";
import { type ReactNode, useState } from "react";
import {
  PAYMENT_METHODS,
  type Tender,
  paymentsToSend,
  refuseTender,
  settleTenders,
} from "../../features/payment/tenders";
import { vi } from "../../messages/vi";
import { Alert, ScreenFrame } from "../shared/screen-frame";
import { CashEntry } from "./cash-entry";

const T = vi.checkout.payment;

export interface PaymentScreenProps {
  header: ReactNode;
  /** The domain's amount due on the draft as last saved: what the server will check. */
  amountDue: Vnd;
  onBack(): void;
  onPaid(tenders: readonly Tender[]): Promise<void>;
}

/**
 * Taking the money: cash with quick keys and change, a bank transfer confirmed by hand, or
 * several of them. Every amount on screen is the domain's arithmetic, none is the screen's.
 */
export function PaymentScreen({ header, amountDue, onBack, onPaid }: PaymentScreenProps) {
  const [tenders, setTenders] = useState<readonly Tender[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const settlement = settleTenders(amountDue, tenders);
  const payable = paymentsToSend(amountDue, settlement) !== null;
  const owed = compareVnd(settlement.remaining, ZERO_VND) > 0;

  function take(tender: Tender) {
    const refusal = refuseTender(amountDue, tenders, tender);
    if (refusal !== null) return setError(T.refusals[refusal]);
    setError(null);
    setTenders([...tenders, tender]);
  }

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      await onPaid(tenders);
    } catch {
      setBusy(false);
      setError(T.failed);
    }
  }

  return (
    <ScreenFrame title={T.title}>
      {header}
      <p className="pos-due">
        {T.amountDue}: <strong data-amount-due={String(amountDue)}>{formatVnd(amountDue)}</strong>
      </p>
      {tenders.length === 0 ? null : (
        <ul className="pos-list">
          {tenders.map((tender, index) => {
            const method = vi.checkout.methods[tender.method];
            return (
              <li key={index} className="pos-tender">
                <span className="pos-wrap">
                  {method} {formatVnd(tender.amount)}
                </span>
                <button
                  type="button"
                  className="pos-button pos-button--quiet"
                  aria-label={T.removeTender(method, formatVnd(tender.amount))}
                  onClick={() => setTenders(tenders.filter((_, at) => at !== index))}
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <dl className="pos-totals">
        <dt>{T.remaining}</dt>
        <dd data-remaining={String(settlement.remaining)}>{formatVnd(settlement.remaining)}</dd>
        <dt className="pos-totals__due">{T.change}</dt>
        <dd className="pos-totals__due" data-change={String(settlement.change)}>
          {formatVnd(settlement.change)}
        </dd>
      </dl>
      {owed ? (
        <>
          <CashEntry
            remaining={settlement.remaining}
            onTake={(amount) => take({ method: PAYMENT_METHODS.cash, amount })}
            onUnreadable={() => setError(T.refusals.unreadable)}
          />
          {/* Automatic confirmation by the bank's notice will replace the cashier's tap here. */}
          <section className="pos-card" aria-label={T.qr}>
            <p className="pos-wrap">{T.qrHint(formatVnd(settlement.remaining))}</p>
            <button
              type="button"
              className="pos-button"
              onClick={() =>
                take({ method: PAYMENT_METHODS.qrTransfer, amount: settlement.remaining })
              }
            >
              {T.qrConfirm(formatVnd(settlement.remaining))}
            </button>
          </section>
        </>
      ) : null}
      <Alert message={error} />
      <div className="pos-actions">
        <button type="button" className="pos-button" onClick={onBack} disabled={busy}>
          {T.back}
        </button>
        <button
          type="button"
          className="pos-button pos-button--primary"
          disabled={!payable || busy}
          onClick={finish}
        >
          {busy ? T.finishing : T.finish}
        </button>
      </div>
    </ScreenFrame>
  );
}
