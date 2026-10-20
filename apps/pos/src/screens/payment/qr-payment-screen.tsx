import type { PaymentAccount } from "@fnb/contracts";
import { type Vnd, formatVnd } from "@fnb/domain";
import { CircleCheck, Clock, LoaderCircle, type LucideIcon, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { type QrPhase, countdownText } from "../../features/payment/qr-intent-phase";
import { ORDER_HAS_SETTLED_QR } from "../../features/payment/settled-qr";
import { messageForCode, vi } from "../../messages/vi";
import { Icon } from "../shared/icon";
import { Alert, ScreenFrame } from "../shared/screen-frame";
import { QrCodeImage } from "./qr-code-image";

const Q = vi.qr;

const STATUS_ICON: Readonly<Record<"info" | "ok" | "warn", LucideIcon>> = {
  info: LoaderCircle,
  ok: CircleCheck,
  warn: TriangleAlert,
};

export interface QrPaymentScreenProps {
  header: ReactNode;
  amount: Vnd;
  account: PaymentAccount;
  /** The QR drawn on the till, null until it is recorded. */
  qr: { readonly contentCode: string; readonly payload: string } | null;
  phase: QrPhase;
  /** A problem on the till itself: the QR could not be drawn, the payment not recorded. */
  error: string | null;
  busy: boolean;
  onCancel(): void;
  onRenew(): void;
  onOtherMethod(): void;
  onRetryPay(): void;
  onCloseWithSettledQr(): void;
}

function statusOf(phase: QrPhase): { text: string; tone: "info" | "ok" | "warn" } {
  switch (phase.kind) {
    case "drawing":
      return { text: Q.phases.drawing, tone: "info" };
    case "waiting":
      return { text: Q.phases.waiting, tone: "info" };
    case "paid":
      return { text: Q.phases.paid, tone: "ok" };
    case "short":
      return { text: Q.phases.short(formatVnd(phase.gap)), tone: "warn" };
    case "over":
      return { text: Q.phases.over(formatVnd(phase.gap)), tone: "warn" };
    case "expired":
      return { text: phase.lateTransfer ? Q.phases.expiredLate : Q.phases.expired, tone: "warn" };
    case "withdrawn":
      return { text: Q.phases.withdrawn, tone: "warn" };
    case "refused":
      return { text: `${Q.phases.refused} ${messageForCode(phase.code)}`, tone: "warn" };
  }
}

/**
 * The VietQR for the whole amount due, its transfer content and its time left, and what the
 * bank's notice did to it. Nothing here confirms a transfer: only the server's match does.
 */
export function QrPaymentScreen(props: QrPaymentScreenProps) {
  const { amount, account, qr, phase, busy } = props;
  const status = statusOf(phase);
  const button = (label: string, onClick: () => void, primary = false) => (
    <button
      key={label}
      type="button"
      className={primary ? "pos-button pos-button--primary" : "pos-button"}
      onClick={onClick}
      disabled={busy}
    >
      {label}
    </button>
  );
  const other = button(Q.otherMethod, props.onOtherMethod);
  const renew = button(Q.renew, props.onRenew, true);
  const actions: Record<QrPhase["kind"], ReactNode[]> = {
    drawing: [button(Q.cancel, props.onCancel)],
    waiting: [button(Q.cancel, props.onCancel)],
    paid: props.error === null ? [] : [button(Q.retryPay, props.onRetryPay, true)],
    short: [other],
    over: [other],
    expired: [other, renew],
    withdrawn: [other, renew],
    refused:
      phase.kind === "refused" && phase.code === ORDER_HAS_SETTLED_QR
        ? [button(Q.closeWithSettledQr, props.onCloseWithSettledQr, true)]
        : [other, renew],
  };
  const actionRow = actions[phase.kind];
  return (
    <ScreenFrame
      title={Q.title}
      dock={
        actionRow.length === 0 ? undefined : (
          <div className="pos-actions pos-actions--split">{actionRow}</div>
        )
      }
    >
      {props.header}
      <p className="pos-due pos-due--center">
        <span className="pos-due__label">{Q.amount}</span>
        <strong data-qr-amount={String(amount)}>{formatVnd(amount)}</strong>
      </p>
      <p
        className={`pos-qr-status pos-qr-status--${status.tone}`}
        role="status"
        data-qr-phase={phase.kind}
      >
        <Icon of={STATUS_ICON[status.tone]} size={phase.kind === "paid" ? 28 : 22} />
        {status.text}
      </p>
      {phase.kind === "short" || phase.kind === "over" ? (
        <p className="pos-hint pos-wrap">{Q.phases.gapHint}</p>
      ) : null}
      {phase.kind === "waiting" && qr !== null ? (
        <section className="pos-card pos-qr" aria-label={Q.title}>
          <div className="pos-qr__frame">
            <QrCodeImage text={qr.payload} label={Q.imageLabel(formatVnd(amount))} />
          </div>
          <dl className="pos-qr__facts">
            <div className="pos-qr__fact pos-qr__fact--code">
              <dt>{Q.content}</dt>
              <dd className="pos-qr__code" data-qr-content={qr.contentCode}>
                {qr.contentCode}
              </dd>
            </div>
            <div className="pos-qr__fact">
              <dt>{Q.accountNumber}</dt>
              <dd className="pos-wrap">{account.accountNumber}</dd>
            </div>
            <div className="pos-qr__fact">
              <dt>{Q.accountName}</dt>
              <dd className="pos-wrap">{account.accountName}</dd>
            </div>
            <div className="pos-qr__fact pos-qr__fact--time" data-low={phase.secondsLeft < 60}>
              <dt>{Q.timeLeft}</dt>
              <dd data-qr-seconds-left={phase.secondsLeft}>
                <Icon of={Clock} size={20} />
                {countdownText(phase.secondsLeft)}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}
      <Alert message={props.error} />
    </ScreenFrame>
  );
}
