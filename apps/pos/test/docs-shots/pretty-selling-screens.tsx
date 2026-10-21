import { posProductSchema } from "@fnb/contracts";
import { buildVietQrPayload } from "@fnb/domain/payment";
import type { ReactElement, ReactNode } from "react";
import { cartView } from "../../src/features/order/cart-view";
import { billSlip } from "../../src/features/printing/bill-slip";
import { cupLabelSlip } from "../../src/features/printing/cup-label-slip";
import { kitchenSlips } from "../../src/features/printing/kitchen-slips";
import { BuyerInfoScreen } from "../../src/screens/invoice/buyer-info-screen";
import { BuyerInvoiceOffer, SaleInvoicePanel } from "../../src/screens/invoice/sale-invoice-panel";
import { OpenShiftScreen } from "../../src/screens/open-shift/open-shift-screen";
import { PaymentDrawer } from "../../src/screens/payment/payment-drawer";
import { QrPanel } from "../../src/screens/payment/qr-panel";
import { SaleDoneScreen } from "../../src/screens/payment/sale-done-screen";
import { ModifierPickerScreen } from "../../src/screens/sale/modifier-picker-screen";
import { SaleScreen } from "../../src/screens/sale/sale-screen";
import { UnderLayer } from "../../src/screens/shared/under-layer";
import { SellingModeSwitch } from "../../src/screens/till/selling-mode-switch";
import { TillHeader } from "../../src/screens/till/till-header";
import { TillTools } from "../../src/screens/till/till-tools";
import type { TillSyncStatus } from "../../src/features/sync/till-sync-status";
import { P, PRODUCTS, PROFILE, SHOP } from "./pretty-menu";
import { INVOICE, ORDER, PRICED, SALE, STAFF, menu, now } from "./pretty-order";

// Selling, taking the money and the slips at the sample café, for the handbook's pictures.

const never = () => new Promise<never>(() => {});
const nothing = () => {};
const ONLINE: TillSyncStatus = { connection: "online", pending: 0, needsAttention: 0 };

/** The bar on top of every screen of a signed-in till. */
export const tillBar = (status: TillSyncStatus = ONLINE) => (
  <TillHeader
    branchName={SHOP.branch}
    brandName={SHOP.brand}
    deviceName={SHOP.device}
    staffName={STAFF.cashier}
    shiftDate="2026-10-21"
    status={status}
    onOpenNeedsAttention={nothing}
    onSwitchStaff={nothing}
    onSignOut={nothing}
  />
);

/** The bar, and below it the selling modes and the till's tools. */
export function tillHeader(mode: "counter" | "tables", status: TillSyncStatus = ONLINE): ReactNode {
  return (
    <>
      {tillBar(status)}
      <div className="pos-navbar">
        <SellingModeSwitch mode={mode} onChange={nothing} />
        <TillTools onOpen={nothing} />
      </div>
    </>
  );
}

const adjust = { onVoid: nothing, onDiscount: nothing, onDiscountOrder: nothing, onCancelOrder: nothing };
export const saleScreen = (status?: TillSyncStatus) => (
  <SaleScreen
    header={tillHeader("counter", status)}
    menu={menu}
    now={now}
    order={ORDER}
    view={cartView(menu, ORDER, PROFILE, now)}
    adjust={adjust}
    saveFailed={false}
    onPick={nothing}
    onQuantity={nothing}
    onRemove={nothing}
    onServiceType={nothing}
    onCheckout={nothing}
  />
);
const overTheSale = (drawer: ReactElement) => (
  <>
    <UnderLayer covered>{saleScreen()}</UnderLayer>
    {drawer}
  </>
);
const due = PRICED.totals.amountDue;
const ACCOUNT = { bankBin: "970436", accountNumber: "0071001234567", accountName: "CONG TY CA PHE MAU" };
const CODE = "FNB7K2M9QXA";
const qrDrawer = (phase: Parameters<typeof QrPanel>[0]["phase"]) =>
  overTheSale(
    <PaymentDrawer
      subtitle={`Đơn số ${ORDER.deviceOrderNo} · ${STAFF.cashier}`}
      amountDue={due}
      qrAccountSet
      initialWay="qr"
      onQr={nothing}
      onLeaveQr={async () => true}
      qrBusy={false}
      onBack={nothing}
      onPaid={never}
      qrPanel={() => (
        <QrPanel
          amount={due}
          account={ACCOUNT}
          qr={{ contentCode: CODE, payload: buildVietQrPayload({ ...ACCOUNT, amount: due, content: CODE }) }}
          phase={phase}
          error={null}
          busy={false}
          onLeave={nothing}
          onRenew={nothing}
          onRetryPay={nothing}
          onCloseWithSettledQr={nothing}
        />
      )}
    />,
  );
const slips = [
  ...kitchenSlips(menu, SALE, now).map((ticket) => ticket.job),
  cupLabelSlip(menu, SALE, now),
  billSlip(menu, SALE, now),
].flatMap((job) => (job === null ? [] : [{ job, outcome: { status: "preview_only" as const } }]));
const milkTea = PRODUCTS.find((product) => product.id === P["Trà sữa trân châu"]);

export const SELLING_SCREENS = {
  "open-shift": () => <OpenShiftScreen header={tillHeader("counter")} onOpen={never} />,
  sale: () => saleScreen(),
  "sale-photos": () => saleScreen(),
  // Not one of the layout test's screens: the selling screen of a till that lost the network.
  "sale-offline": () => saleScreen({ connection: "offline", pending: 3, needsAttention: 1 }),
  "modifier-picker": () => (
    <ModifierPickerScreen
      header={tillHeader("counter")}
      menu={menu}
      product={posProductSchema.parse(milkTea)}
      now={now}
      onAdd={nothing}
      onCancel={nothing}
    />
  ),
  payment: () =>
    overTheSale(
      <PaymentDrawer
        subtitle={`Đơn số ${ORDER.deviceOrderNo} · ${STAFF.cashier}`}
        amountDue={due}
        qrAccountSet
        invoice={<BuyerInvoiceOffer buyer={null} onEdit={nothing} />}
        onQr={nothing}
        onLeaveQr={async () => true}
        qrPanel={() => null}
        qrBusy={false}
        onBack={nothing}
        onPaid={never}
      />,
    ),
  "qr-payment": () => qrDrawer({ kind: "waiting", secondsLeft: 812 }),
  "qr-payment-refused": () => qrDrawer({ kind: "refused", code: "SYNC_ORDER_HAS_SETTLED_QR" }),
  "buyer-info": () => (
    <BuyerInfoScreen
      header={null}
      buyer={{ taxCode: "0312345678", name: "Công ty TNHH Hoa Sen", address: "12 Lê Lợi, Quận 1, TP.HCM", email: "ketoan@hoasen.vn" }}
      onSave={never}
      onBack={nothing}
    />
  ),
  "sale-done": () => <SaleDoneScreen header={null} sale={SALE} slips={slips} onNextOrder={nothing} />,
  "sale-done-invoice": () => (
    <SaleDoneScreen
      header={null}
      sale={SALE}
      slips={[
        {
          job: billSlip(menu, SALE, now, { code: INVOICE.lookupCode, url: INVOICE.lookupUrl }),
          outcome: { status: "preview_only" },
        },
      ]}
      invoice={
        <SaleInvoicePanel invoice={INVOICE} buyer={null} reprinting={false} onEditBuyer={nothing} onReprint={nothing} />
      }
      onNextOrder={nothing}
    />
  ),
} satisfies Record<string, () => ReactElement>;
