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
import { Alert } from "../shared/screen-frame";
import { SideDrawer } from "../shared/side-drawer";
import { useTillKey } from "../shared/use-till-key";
import { CashBalance } from "./cash-balance";
import { CashEntry } from "./cash-entry";
import { type PayWay, PaymentMethodCards } from "./payment-method-cards";

const T = vi.checkout.payment;
const Q = vi.qr;

export interface PaymentDrawerProps {
  /** Which order is being paid, under the title. */
  subtitle?: string;
  /** The domain's amount due on the draft as last saved: what the server will check. */
  amountDue: Vnd;
  /** Whether the branch set an account a VietQR can ask customers to transfer to. */
  qrAccountSet: boolean;
  /** Who the e-invoice is for, when the branch issues them; shown on the cash card. */
  invoice?: ReactNode;
  /** The way chosen when the drawer opens. */
  initialWay?: PayWay;
  /** Shows a VietQR for the whole amount due; the bank's notice, not the cashier, confirms it. */
  onQr(): void;
  /** Takes a QR still out down; false when that could not be recorded and the QR stays. */
  onLeaveQr(): Promise<boolean>;
  /** The QR and what it came to; `backToCash` is how its own buttons leave it. */
  qrPanel(backToCash: () => void): ReactNode;
  /** The QR is being drawn, taken down or paid: no other choice can be made meanwhile. */
  qrBusy: boolean;
  onBack(): void;
  onPaid(tenders: readonly Tender[]): Promise<void>;
}

/**
 * Taking the money in a drawer over the order: what is due, a card for cash and one for the
 * QR, and under them what the chosen way needs. Cash can come in several pieces; a QR asks
 * for exactly the whole total (the server checks), so it is offered only while no cash was
 * taken. Every amount on screen is the domain's arithmetic, none is the screen's.
 */
export function PaymentDrawer(props: PaymentDrawerProps) {
  const { amountDue, onPaid } = props;
  const [way, setWay] = useState<PayWay>(props.initialWay ?? "cash");
  const [tenders, setTenders] = useState<readonly Tender[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const settlement = settleTenders(amountDue, tenders);
  const payable = way === "cash" && paymentsToSend(amountDue, settlement) !== null;
  const owed = compareVnd(settlement.remaining, ZERO_VND) > 0;
  const locked = busy || props.qrBusy;
  const qrUnavailable = !props.qrAccountSet
    ? Q.noAccount
    : tenders.length > 0
      ? Q.wholeOrderOnly
      : null;
  useTillKey(vi.sale.keys.pay, () => void finish(), payable && !locked);

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

  async function choose(next: PayWay) {
    setError(null);
    if (next === "qr") {
      setWay("qr");
      if (qrUnavailable === null) props.onQr();
    } else if (way !== "qr" || qrUnavailable !== null || (await props.onLeaveQr())) {
      setWay("cash");
    }
  }

  async function close() {
    if (way === "qr" && qrUnavailable === null && !(await props.onLeaveQr())) return;
    props.onBack();
  }

  return (
    <SideDrawer
      title={T.title}
      {...(props.subtitle === undefined ? {} : { subtitle: props.subtitle })}
      closeLabel={T.back}
      closeDisabled={locked}
      onClose={() => void close()}
      foot={
        way !== "cash" ? undefined : (
          <button
            type="button"
            className="pos-button pos-button--primary pos-button--lg pos-button--block"
            disabled={!payable || locked}
            onClick={() => void finish()}
          >
            {busy ? T.finishing : T.finish}
            <kbd className="pos-kbd pos-kbd--on-brand" aria-hidden>
              {vi.sale.keys.pay}
            </kbd>
          </button>
        )
      }
    >
      <p className="pos-due pos-due--drawer">
        <span className="pos-due__label">{T.amountDue}</span>
        <strong data-amount-due={String(amountDue)}>{formatVnd(amountDue)}</strong>
      </p>
      {compareVnd(amountDue, ZERO_VND) === 0 ? null : (
        <PaymentMethodCards chosen={way} disabled={locked} onChoose={(next) => void choose(next)} />
      )}
      {way === "cash" ? (
        <div className="pos-pay-cash">
          <CashBalance
            tenders={tenders}
            settlement={settlement}
            onRemove={(index) => setTenders(tenders.filter((_, at) => at !== index))}
          />
          {owed ? (
            <CashEntry
              remaining={settlement.remaining}
              onTake={(amount) => take({ method: PAYMENT_METHODS.cash, amount })}
              onUnreadable={() => setError(T.refusals.unreadable)}
            />
          ) : null}
        </div>
      ) : qrUnavailable !== null ? (
        <p className="pos-hint pos-wrap" data-qr-unavailable>
          {qrUnavailable}
        </p>
      ) : (
        props.qrPanel(() => setWay("cash"))
      )}
      <Alert message={error} />
      {/* Not beside a QR still out: editing the buyer leaves the drawer, and the QR must be
          taken down before that, so the buyer is set on the cash card first. */}
      {way === "cash" ? props.invoice : null}
    </SideDrawer>
  );
}
