import type { PaymentAccount, WalletKey } from "@fnb/contracts";
import type { Vnd } from "@fnb/domain";
import type { LocalCommand, SyncClient } from "@fnb/sync-client";
import { type ReactNode, useCallback, useState } from "react";
import type { TillPlace } from "../features/order/till-command";
import type { Tender } from "../features/payment/tenders";
import { useTillPermissions } from "../features/permissions/till-permissions-context";
import { connectionIsDown, useTillConnection } from "../features/sync/till-connection-context";
import { useApprovalGate } from "../features/permissions/use-approval-gate";
import { LeaveQrWhileOfflineSheet } from "../screens/payment/leave-qr-while-offline-sheet";
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
  const unsure = connectionIsDown(useTillConnection()) || !online;
  /** Answers the cashier's choice when asked to take a QR down that may have been paid. */
  const [leaving, setLeaving] = useState<((takeDown: boolean) => void) | null>(null);
  const takeDownQr = qr.leave;
  // Offline, a transfer may have come in that the till has not heard of: taking the QR down
  // to take cash would charge the guest twice, so the cashier is told first.
  const leaveQr = useCallback(
    () =>
      unsure && qr.mayBePaid
        ? new Promise<boolean>((resolve) =>
            setLeaving(() => (takeDown: boolean) => {
              setLeaving(null);
              if (takeDown) void takeDownQr().then(resolve);
              else resolve(false);
            }),
          )
        : takeDownQr(),
    [unsure, qr.mayBePaid, takeDownQr],
  );
  const asking = gate.sheet !== null || leaving !== null;
  return (
    <>
      <UnderLayer covered={asking}>
        <div style={{ display: asking ? "none" : "contents" }}>
          {drawerOf(props, { ...qr, leave: leaveQr }, wallet, online)}
        </div>
      </UnderLayer>
      {asking ? (
        <CoverLayer>
          {leaving === null ? gate.sheet : <LeaveQrWhileOfflineSheet onChoose={leaving} />}
        </CoverLayer>
      ) : null}
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
