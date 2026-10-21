import type { PaymentAccount } from "@fnb/contracts";
import type { Vnd } from "@fnb/domain";
import type { LocalCommand, SyncClient } from "@fnb/sync-client";
import type { ReactNode } from "react";
import type { TillPlace } from "../features/order/till-command";
import type { Tender } from "../features/payment/tenders";
import { PaymentDrawer } from "../screens/payment/payment-drawer";
import { QrPanel } from "../screens/payment/qr-panel";
import { useCounterQr } from "./use-counter-qr";

export interface CounterPaymentDrawerProps {
  client: SyncClient;
  place: TillPlace;
  orderId: string;
  subtitle: string;
  amountDue: Vnd;
  account: PaymentAccount | null;
  invoice: ReactNode;
  record(command: LocalCommand): Promise<void>;
  onBack(): void;
  onPaid(tenders: readonly Tender[]): Promise<void>;
}

/** The payment drawer of an order, with its VietQR drawn and watched while the QR is chosen. */
export function CounterPaymentDrawer(props: CounterPaymentDrawerProps) {
  const { account, amountDue } = props;
  const qr = useCounterQr(props);
  return (
    <PaymentDrawer
      subtitle={props.subtitle}
      amountDue={amountDue}
      qrAccountSet={account !== null}
      invoice={props.invoice}
      onQr={qr.show}
      onLeaveQr={qr.leave}
      qrBusy={qr.locked}
      onBack={props.onBack}
      onPaid={props.onPaid}
      qrPanel={(backToCash) =>
        account === null ? null : (
          <QrPanel
            amount={amountDue}
            account={account}
            qr={qr.drawn}
            phase={qr.phase}
            error={qr.error}
            busy={qr.busy}
            onLeave={() => {
              void qr.leave().then((left) => {
                if (left) backToCash();
              });
            }}
            onRenew={qr.show}
            onRetryPay={qr.retryPay}
            onCloseWithSettledQr={() => void qr.closeWithSettledQr()}
          />
        )
      }
    />
  );
}
