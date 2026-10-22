import { walletsOfSettings } from "@fnb/contracts";
import type { SyncClient } from "@fnb/sync-client";
import { type ReactNode, useLayoutEffect, useState } from "react";
import type { TillMenu } from "../features/menu/till-menu";
import { callNumberOf } from "../features/order/device-order-number";
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
import { BuyerInfoScreen } from "../screens/invoice/buyer-info-screen";
import { BuyerInvoiceOffer, SaleInvoicePanel } from "../screens/invoice/sale-invoice-panel";
import { SaleDoneScreen } from "../screens/payment/sale-done-screen";
import { CoverLayer } from "../screens/shared/under-layer";
import { vi } from "../messages/vi";
import { CounterPaymentDrawer } from "./counter-payment-drawer";
import { useCheckoutInvoice } from "./use-checkout-invoice";

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
  /** What the button after the sale says, when it does not start the next counter order. */
  nextOrderLabel?: string;
  /**
   * Whether a step that takes the whole screen (the buyer's form, the finished sale) is up:
   * the order under the checkout is then not drawn at all, so nothing of it is on the page
   * twice (its bar's sync badge, its lines).
   */
  onWholeScreen(on: boolean): void;
}

type Step = "paying" | "buyer";

interface PaidOrder {
  readonly sale: PaidSale;
  /** Null while the slips are still printing; a reprint is added at the end. */
  readonly slips: readonly PrintedSlip[] | null;
}

/**
 * Taking the money for the order (cash, or a QR the bank confirms) in a drawer over the order,
 * who its e-invoice is for, then its slips, and the bill again once the invoice is issued.
 * The buyer's form and the finished sale take the whole screen, over the order.
 */
export function CounterCheckout(props: CounterCheckoutProps) {
  const { client, place, menu, header, session, order, priced } = props;
  const [step, setStep] = useState<Step>("paying");
  const [paid, setPaid] = useState<PaidOrder | null>(null);
  const [reprinting, setReprinting] = useState(false);
  const account = paymentAccountOf(menu.config);
  const wallets = walletsOfSettings(menu.config.settings);
  const { onWholeScreen } = props;
  const wholeScreen = step === "buyer" || paid !== null;
  // Before paint, so the order and the whole-screen step are never on the page together.
  useLayoutEffect(() => onWholeScreen(wholeScreen), [onWholeScreen, wholeScreen]);
  useLayoutEffect(() => () => onWholeScreen(false), [onWholeScreen]);
  const invoicing = useCheckoutInvoice(props, paid?.sale ?? null);
  const addSlip = (slip: PrintedSlip) =>
    setPaid((shown) =>
      shown === null ? null : { ...shown, slips: [...(shown.slips ?? []), slip] },
    );

  async function finish(tenders: readonly Tender[]) {
    const sale = await paySale({ ...props, tenders, at: Date.now() });
    setPaid({ sale, slips: null });
    setStep("paying");
    const slips = await printSaleSlips({
      ...props,
      sale,
      record: session.record,
      now: Date.now,
    }).catch((error: unknown) => {
      console.error(error);
      return [];
    });
    setPaid((shown) => (shown?.sale === sale ? { ...shown, slips } : shown));
  }

  async function reprint() {
    setReprinting(true);
    try {
      const slip = await invoicing.reprint();
      if (slip !== null) addSlip(slip);
    } catch (error) {
      console.error(error);
    } finally {
      setReprinting(false);
    }
  }

  const editBuyer = () => setStep("buyer");
  const invoiceSlot = !invoicing.enabled ? null : paid === null ? (
    <BuyerInvoiceOffer buyer={invoicing.buyer} onEdit={editBuyer} />
  ) : (
    <SaleInvoicePanel
      invoice={invoicing.invoice}
      buyer={invoicing.buyer}
      reprinting={reprinting}
      onEditBuyer={editBuyer}
      onReprint={() => void reprint()}
    />
  );

  if (step === "buyer") {
    return (
      <CoverLayer>
        <BuyerInfoScreen
          header={header}
          buyer={invoicing.buyer}
          onSave={async (buyer) => {
            await invoicing.saveBuyer(buyer);
            setStep("paying");
          }}
          onBack={() => setStep("paying")}
        />
      </CoverLayer>
    );
  }
  if (paid !== null) {
    return (
      <CoverLayer>
        <SaleDoneScreen
          header={header}
          sale={paid.sale}
          slips={paid.slips}
          invoice={invoiceSlot}
          {...(props.nextOrderLabel === undefined ? {} : { nextOrderLabel: props.nextOrderLabel })}
          onNextOrder={props.onNextOrder}
        />
      </CoverLayer>
    );
  }
  const S = vi.sale;
  const where =
    order.table === null
      ? S.callNumber(callNumberOf(order.deviceOrderNo))
      : vi.tables.order.tableLabel(order.table.name);
  return (
    <CounterPaymentDrawer
      client={client}
      place={place}
      orderId={order.orderId}
      subtitle={`${S.orderNumber(order.deviceOrderNo)} · ${where}`}
      amountDue={priced.totals.amountDue}
      account={account}
      wallets={wallets}
      invoice={invoiceSlot}
      record={session.record}
      onBack={props.onBackToSale}
      onPaid={finish}
    />
  );
}
