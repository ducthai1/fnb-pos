import type { SyncClient } from "@fnb/sync-client";
import { type ReactNode, useState } from "react";
import type { TillMenu } from "../features/menu/till-menu";
import type { CounterOrder } from "../features/order/counter-order";
import type { PricedCounterOrder } from "../features/order/price-counter-order";
import type { TillPlace } from "../features/order/till-command";
import type { CounterOrderSession } from "../features/order/use-counter-order";
import { paySale } from "../features/payment/pay-sale";
import { paymentAccountOf } from "../features/payment/payment-account";
import type { Tender } from "../features/payment/tenders";
import type { PaidSale } from "../features/printing/paid-sale";
import { type PrintedSlip, printSaleSlips } from "../features/printing/print-sale-slips";
import type { PrinterPort } from "../features/printing/printer-port";
import { PaymentScreen } from "../screens/payment/payment-screen";
import { SaleDoneScreen } from "../screens/payment/sale-done-screen";
import { CounterQrPayment } from "./counter-qr-payment";

export interface CounterCheckoutProps {
  client: SyncClient;
  place: TillPlace;
  menu: TillMenu;
  header: ReactNode;
  shiftId: string;
  cashierName: string;
  printer: PrinterPort;
  session: CounterOrderSession;
  order: CounterOrder;
  /** The draft as last saved, which is what the server prices the payment against. */
  priced: PricedCounterOrder;
  onBackToSale(): void;
  onNextOrder(): void;
}

type Step =
  | { readonly kind: "paying" }
  | { readonly kind: "qr" }
  | {
      readonly kind: "done";
      readonly sale: PaidSale;
      readonly slips: readonly PrintedSlip[] | null;
    };

/** Taking the money for the order on the counter (cash, or a QR the bank confirms), then its slips. */
export function CounterCheckout(props: CounterCheckoutProps) {
  const { client, place, menu, header, session, order, priced } = props;
  const [step, setStep] = useState<Step>({ kind: "paying" });
  const account = paymentAccountOf(menu.config);

  async function finish(tenders: readonly Tender[]) {
    const sale = await paySale({ ...props, tenders, at: Date.now() });
    setStep({ kind: "done", sale, slips: null });
    const slips = await printSaleSlips({
      ...props,
      sale,
      record: session.record,
      now: Date.now,
    }).catch((error: unknown) => {
      console.error(error);
      return [];
    });
    setStep((shown) =>
      shown.kind === "done" && shown.sale === sale ? { ...shown, slips } : shown,
    );
  }

  if (step.kind === "done") {
    return (
      <SaleDoneScreen
        header={header}
        sale={step.sale}
        slips={step.slips}
        onNextOrder={props.onNextOrder}
      />
    );
  }
  if (step.kind === "qr" && account !== null) {
    return (
      <CounterQrPayment
        client={client}
        place={place}
        header={header}
        orderId={order.orderId}
        amountDue={priced.totals.amountDue}
        account={account}
        record={session.record}
        onPaid={finish}
        onLeave={() => setStep({ kind: "paying" })}
      />
    );
  }
  return (
    <PaymentScreen
      header={header}
      amountDue={priced.totals.amountDue}
      qrAccountSet={account !== null}
      onBack={props.onBackToSale}
      onQr={() => setStep({ kind: "qr" })}
      onPaid={finish}
    />
  );
}
