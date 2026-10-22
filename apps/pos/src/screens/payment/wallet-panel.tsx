import { type Vnd, formatVnd } from "@fnb/domain";
import { CircleCheck, Clock, LoaderCircle, type LucideIcon, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { type QrPhase, countdownText } from "../../features/payment/qr-intent-phase";
import { vi } from "../../messages/vi";
import { Icon } from "../shared/icon";
import { Alert } from "../shared/screen-frame";
import { QrCodeImage } from "./qr-code-image";

const W = vi.wallet;

const STATUS_ICON: Readonly<Record<"info" | "ok" | "warn", LucideIcon>> = {
  info: LoaderCircle,
  ok: CircleCheck,
  warn: TriangleAlert,
};

export interface WalletPanelProps {
  /** The wallet's name, as on its card. */
  name: string;
  amount: Vnd;
  /** What the customer scans with the wallet's app; null until the server answered. */
  qrContent: string | null;
  phase: QrPhase;
  error: string | null;
  busy: boolean;
  onLeave(): void;
  onRenew(): void;
  onRetryPay(): void;
}

function statusOf(name: string, phase: QrPhase): { text: string; tone: "info" | "ok" | "warn" } {
  switch (phase.kind) {
    case "drawing":
    case "refused":
      return { text: W.phases.drawing(name), tone: "info" };
    case "waiting":
      return { text: W.phases.waiting(name), tone: "info" };
    case "paid":
      return { text: W.phases.paid(name), tone: "ok" };
    case "short":
      return { text: W.phases.short(formatVnd(phase.gap)), tone: "warn" };
    case "over":
      return { text: W.phases.over(formatVnd(phase.gap)), tone: "warn" };
    case "expired":
      return { text: W.phases.expired, tone: "warn" };
    case "withdrawn":
      return { text: W.phases.withdrawn, tone: "warn" };
  }
}

/**
 * The wallet's QR for the whole amount due and its time left, in the payment drawer. The
 * amount is locked inside the wallet's payment, so the customer only confirms; nothing
 * here confirms the payment, only the server's word from the wallet does.
 */
export function WalletPanel(props: WalletPanelProps) {
  const { name, amount, phase, busy, qrContent } = props;
  const status = statusOf(name, phase);
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
  const other = button(W.otherMethod, props.onLeave);
  const renew = button(W.renew, props.onRenew, true);
  const unopened = qrContent === null && props.error !== null;
  const actions: Record<QrPhase["kind"], ReactNode[]> = {
    drawing: unopened ? [other, button(W.retry, props.onRenew, true)] : [],
    refused: [other, renew],
    waiting: [button(W.cancel, props.onLeave)],
    paid: props.error === null ? [] : [button(vi.qr.retryPay, props.onRetryPay, true)],
    short: [other],
    over: [other],
    expired: [other, renew],
    withdrawn: [other, renew],
  };
  const actionRow = actions[phase.kind];
  return (
    <section className="pos-qr-panel" aria-label={name} data-wallet-panel>
      {unopened ? null : (
        <p
          className={`pos-qr-status pos-qr-status--${status.tone}`}
          role="status"
          data-wallet-phase={phase.kind}
        >
          <Icon of={STATUS_ICON[status.tone]} size={phase.kind === "paid" ? 28 : 22} />
          {status.text}
        </p>
      )}
      {phase.kind === "short" || phase.kind === "over" ? (
        <p className="pos-hint pos-wrap">{vi.qr.phases.gapHint}</p>
      ) : null}
      {phase.kind === "waiting" && qrContent !== null ? (
        <div className="pos-card pos-qr">
          <div className="pos-qr__frame" data-wallet-qr={qrContent}>
            <QrCodeImage text={qrContent} label={W.imageLabel(name, formatVnd(amount))} />
          </div>
          <dl className="pos-qr__facts">
            <div className="pos-qr__fact">
              <dt>{W.amount}</dt>
              <dd className="pos-qr__amount" data-wallet-amount={String(amount)}>
                {formatVnd(amount)}
              </dd>
            </div>
            <div className="pos-qr__fact pos-qr__fact--time" data-low={phase.secondsLeft < 60}>
              <dt>{W.timeLeft}</dt>
              <dd data-wallet-seconds-left={phase.secondsLeft}>
                <Icon of={Clock} size={20} />
                {countdownText(phase.secondsLeft)}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}
      <Alert message={props.error} />
      {actionRow.length === 0 ? null : (
        <div className="pos-actions pos-actions--split">{actionRow}</div>
      )}
    </section>
  );
}
