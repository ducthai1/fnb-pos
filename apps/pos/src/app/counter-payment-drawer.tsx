import type { PaymentAccount, WalletKey } from "@fnb/contracts";
import type { Vnd } from "@fnb/domain";
import type { LocalCommand, SyncClient } from "@fnb/sync-client";
import type { ReactNode } from "react";
import type { TillPlace } from "../features/order/till-command";
import type { Tender } from "../features/payment/tenders";
import { useTillPermissions } from "../features/permissions/till-permissions-context";
import { useApprovalGate } from "../features/permissions/use-approval-gate";
import { PaymentDrawer } from "../screens/payment/payment-drawer";
import { QrPanel } from "../screens/payment/qr-panel";
import { WalletPanel } from "../screens/payment/wallet-panel";
import { CoverLayer, UnderLayer } from "../screens/shared/under-layer";
import { vi } from "../messages/vi";
import { useCounterQr } from "./use-counter-qr";
import { useCounterWallet } from "./use-counter-wallet";
import { useNavigatorOnline } from "./use-navigator-online";

export interface CounterPaymentDrawerProps {
  client: SyncClient;
  place: TillPlace;
  orderId: string;
  /** The shift the sale is paid into; an over transfer's excess leaves its drawer. */
  shiftId: string;
  subtitle: string;
  amountDue: Vnd;
  account: PaymentAccount | null;
  /** The e-wallets the branch turned on, as its settings reached the till. */
  wallets: readonly WalletKey[];
  invoice: ReactNode;
  record(command: LocalCommand): Promise<void>;
  onBack(): void;
  onPaid(tenders: readonly Tender[]): Promise<void>;
}

/**
 * The payment drawer of an order, with its VietQR drawn and watched while the QR is chosen,
 * and a wallet payment opened on the server and watched while a wallet is. A manager asked to
 * approve handing a QR's excess back takes the whole screen; the drawer waits under it as it
 * was, its QR card still up, so a cashier who does not get the approval chooses again there.
 */
export function CounterPaymentDrawer(props: CounterPaymentDrawerProps) {
  const gate = useApprovalGate();
  const { authority } = useTillPermissions();
  const qr = useCounterQr({ ...props, staffId: authority.staffId, approve: gate.require });
  const wallet = useCounterWallet(props);
  const online = useNavigatorOnline();
  const asking = gate.sheet !== null;
  return (
    <>
      <UnderLayer covered={asking}>
        <div style={{ display: asking ? "none" : "contents" }}>
          {drawerOf(props, qr, wallet, online)}
        </div>
      </UnderLayer>
      {asking ? <CoverLayer>{gate.sheet}</CoverLayer> : null}
    </>
  );
}

function drawerOf(
  props: CounterPaymentDrawerProps,
  qr: ReturnType<typeof useCounterQr>,
  wallet: ReturnType<typeof useCounterWallet>,
  online: boolean,
) {
  const { account, amountDue } = props;
  return (
    <PaymentDrawer
      subtitle={props.subtitle}
      amountDue={amountDue}
      qrAccountSet={account !== null}
      invoice={props.invoice}
      onQr={qr.show}
      onLeaveQr={qr.leave}
      qrBusy={qr.locked}
      wallets={props.wallets}
      walletsOffline={!online}
      onWallet={wallet.show}
      onLeaveWallet={wallet.leave}
      walletBusy={wallet.locked}
      walletPanel={(key, backToCash) => (
        <WalletPanel
          name={vi.wallet.names[key] ?? key}
          amount={amountDue}
          qrContent={wallet.shown?.qrContent ?? null}
          phase={wallet.phase}
          error={wallet.error}
          busy={wallet.busy}
          onLeave={() => {
            void wallet.leave().then((left) => {
              if (left) backToCash();
            });
          }}
          onRenew={() => wallet.show(key)}
          onRetryPay={wallet.retryPay}
        />
      )}
      onBack={props.onBack}
      onPaid={props.onPaid}
      qrPanel={(backToCash, cashFor) =>
        account === null ? null : (
          <QrPanel
            amount={qr.amount}
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
            onCashForRest={() => {
              void qr.shortTenders().then(cashFor);
            }}
            onQrForRest={qr.show}
            onCloseOver={(handBack) => void qr.closeOver(handBack)}
            onRetryPay={qr.retryPay}
            onCloseWithSettledQr={() => void qr.closeWithSettledQr()}
          />
        )
      }
    />
  );
}
