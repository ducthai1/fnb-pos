import { type Vnd, ZERO_VND, compareVnd, formatVnd } from "@fnb/domain";
import { Banknote, QrCode, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import {
  PAYMENT_METHODS,
  type Tender,
  paymentsToSend,
  refuseTender,
  settleTenders,
} from "../../features/payment/tenders";
import { vi } from "../../messages/vi";
import { Icon } from "../shared/icon";
import { Alert, ScreenFrame } from "../shared/screen-frame";
import { CashEntry } from "./cash-entry";
import { QrOffer } from "./qr-offer";

const T = vi.checkout.payment;

export interface PaymentScreenProps {
  header: ReactNode;
  /** The domain's amount due on the draft as last saved: what the server will check. */
  amountDue: Vnd;
  /** Whether the branch set an account a VietQR can ask customers to transfer to. */
  qrAccountSet: boolean;
  /** Who the e-invoice is for, when the branch issues them. */
  invoice?: ReactNode;
  onBack(): void;
  /** Shows a VietQR for the whole amount due; the bank's notice, not the cashier, confirms it. */
  onQr(): void;
  onPaid(tenders: readonly Tender[]): Promise<void>;
}

/**
 * Taking the money: cash with quick keys and change, or a VietQR the bank confirms. Every
 * amount on screen is the domain's arithmetic, none is the screen's.
 */
export function PaymentScreen(props: PaymentScreenProps) {
  const { header, amountDue, onBack, onPaid } = props;
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
    <ScreenFrame title={T.title} wide>
      {header}
      <div className="pos-pay">
        <section className="pos-card pos-pay__summary" aria-label={T.summary}>
          <p className="pos-due">
            <span className="pos-due__label">{T.amountDue}</span>
            <strong data-amount-due={String(amountDue)}>{formatVnd(amountDue)}</strong>
          </p>
          {tenders.length === 0 ? null : (
            <ul className="pos-list pos-tenders">
              {tenders.map((tender, index) => {
                const method = vi.checkout.methods[tender.method];
                return (
                  <li key={index} className="pos-tender">
                    <Icon of={tender.method === PAYMENT_METHODS.cash ? Banknote : QrCode} />
                    <span className="pos-tender__text pos-wrap">
                      {method} {formatVnd(tender.amount)}
                    </span>
                    <button
                      type="button"
                      className="pos-button pos-button--quiet pos-button--sm"
                      aria-label={T.removeTender(method, formatVnd(tender.amount))}
                      onClick={() => setTenders(tenders.filter((_, at) => at !== index))}
                    >
                      <Icon of={X} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <dl className="pos-balance">
            <div className="pos-balance__row" data-owed={owed}>
              <dt>{T.remaining}</dt>
              <dd data-remaining={String(settlement.remaining)}>
                {formatVnd(settlement.remaining)}
              </dd>
            </div>
            <div
              className="pos-balance__row pos-balance__row--change"
              data-has-change={compareVnd(settlement.change, ZERO_VND) > 0}
            >
              <dt>{T.change}</dt>
              <dd data-change={String(settlement.change)}>{formatVnd(settlement.change)}</dd>
            </div>
          </dl>
          {props.invoice}
        </section>
        {owed ? (
          <div className="pos-pay__methods">
            <CashEntry
              remaining={settlement.remaining}
              onTake={(amount) => take({ method: PAYMENT_METHODS.cash, amount })}
              onUnreadable={() => setError(T.refusals.unreadable)}
            />
            <QrOffer
              amountDue={amountDue}
              accountSet={props.qrAccountSet}
              cashTaken={tenders.length > 0}
              onShow={props.onQr}
            />
          </div>
        ) : null}
      </div>
      <div className="pos-dock">
        <Alert message={error} />
        <div className="pos-actions pos-actions--split">
          <button type="button" className="pos-button" onClick={onBack} disabled={busy}>
            {T.back}
          </button>
          <button
            type="button"
            className="pos-button pos-button--primary pos-button--lg"
            disabled={!payable || busy}
            onClick={finish}
          >
            {busy ? T.finishing : T.finish}
          </button>
        </div>
      </div>
    </ScreenFrame>
  );
}
