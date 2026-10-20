import type { PaymentAccount, PaymentIntentSnapshot } from "@fnb/contracts";
import type { Vnd } from "@fnb/domain";
import type { LocalCommand, SyncClient } from "@fnb/sync-client";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNow } from "../features/menu/use-now";
import type { TillPlace } from "../features/order/till-command";
import { type DrawnQr, cancelQrCommand, drawQr } from "../features/payment/qr-intent-commands";
import { qrPhaseOf } from "../features/payment/qr-intent-phase";
import { paidQrOfOrder, qrTenderOf } from "../features/payment/settled-qr";
import type { Tender } from "../features/payment/tenders";
import { useQrIntent } from "../features/payment/use-qr-intent";
import { vi } from "../messages/vi";
import { QrPaymentScreen } from "../screens/payment/qr-payment-screen";

const Q = vi.qr;

export interface CounterQrPaymentProps {
  client: SyncClient;
  place: TillPlace;
  header: ReactNode;
  orderId: string;
  /** The domain's amount due on the draft as last saved: what the QR asks for. */
  amountDue: Vnd;
  account: PaymentAccount;
  /** Records a command after everything already recorded for the order. */
  record(command: LocalCommand): Promise<void>;
  /** Closes the order with the transfer the bank confirmed. */
  onPaid(tenders: readonly Tender[]): Promise<void>;
  /** Back to the payment screen; any QR still out has been taken down. */
  onLeave(): void;
}

/**
 * A VietQR for the order: drawn and registered on arrival, watched through the sync feed,
 * and the order closed the moment the bank's notice paid it exactly. Leaving takes a QR
 * that is still out down, so a late transfer waits for a person instead of paying twice.
 */
export function CounterQrPayment(props: CounterQrPaymentProps) {
  const { client, place, orderId, amountDue, account, record, onPaid } = props;
  const [drawn, setDrawn] = useState<DrawnQr | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shown = useMemo(
    () =>
      drawn === null ? null : { intentId: drawn.intentId, commandId: drawn.command.commandId },
    [drawn],
  );
  const state = useQrIntent(client, shown);
  const phase = qrPhaseOf(state, useNow(1_000));
  const paying = useRef(false);

  const draw = useCallback(
    async (withdraw: PaymentIntentSnapshot | null) => {
      setBusy(true);
      setError(null);
      try {
        const at = Date.now();
        if (withdraw !== null) await record(cancelQrCommand(place, withdraw, at));
        const next = drawQr(place, account, { orderId, amountDue }, at);
        await record(next.command);
        setDrawn(next);
      } catch (failure) {
        console.error(failure);
        setError(Q.drawFailed);
      } finally {
        setBusy(false);
      }
    },
    [record, place, account, orderId, amountDue],
  );

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void draw(null);
  }, [draw]);

  const pay = useCallback(
    async (intent: PaymentIntentSnapshot) => {
      if (paying.current) return;
      paying.current = true;
      setError(null);
      try {
        await onPaid([qrTenderOf(intent)]);
      } catch (failure) {
        console.error(failure);
        paying.current = false;
        setError(Q.failed);
      }
    },
    [onPaid],
  );

  const intent = state.intent;
  useEffect(() => {
    if (phase.kind === "paid" && intent !== null) void pay(intent);
  }, [phase.kind, intent, pay]);

  const stillOut = intent !== null && intent.status === "pending" ? intent : null;
  const leave = async () => {
    setBusy(true);
    try {
      if (stillOut !== null) await record(cancelQrCommand(place, stillOut, Date.now()));
      props.onLeave();
    } catch (failure) {
      console.error(failure);
      setBusy(false);
      setError(Q.failed);
    }
  };

  return (
    <QrPaymentScreen
      header={props.header}
      amount={amountDue}
      account={account}
      qr={drawn}
      phase={phase}
      error={error}
      busy={busy}
      onCancel={leave}
      onOtherMethod={leave}
      onRenew={() => void draw(stillOut)}
      onRetryPay={() => {
        if (intent !== null) void pay(intent);
      }}
      onCloseWithSettledQr={async () => {
        const paid = await paidQrOfOrder(client, orderId);
        if (paid === null) setError(Q.noSettledQr);
        else await pay(paid);
      }}
    />
  );
}
