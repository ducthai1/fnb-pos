import { vnd } from "@fnb/domain";
import { buildVietQrPayload } from "@fnb/domain/payment";
import type { ReactElement } from "react";
import { billSlip } from "../../../src/features/printing/bill-slip";
import { BuyerInfoScreen } from "../../../src/screens/invoice/buyer-info-screen";
import { SaleInvoicePanel } from "../../../src/screens/invoice/sale-invoice-panel";
import { PaymentDrawer } from "../../../src/screens/payment/payment-drawer";
import { QrPanel } from "../../../src/screens/payment/qr-panel";
import { SaleDoneScreen } from "../../../src/screens/payment/sale-done-screen";
import { HOSTILE_NAMES } from "../../../src/test-support/hostile-names";
import { overTheSale } from "./checkout-screens";
import { HOSTILE_INVOICE, HOSTILE_SALE, hostileSaleMenu } from "./hostile-sale";

// The QR, the buyer of the e-invoice and the issued invoice, with the worst data; see
// screens-page.tsx.

const never = () => new Promise<never>(() => {});
const nothing = () => {};
const ACCOUNT = {
  bankBin: "970436",
  accountNumber: "0011001234567891234",
  accountName: HOSTILE_NAMES.staff,
};
const CODE = "FNB7K2M9QXA";
const payload = buildVietQrPayload({ ...ACCOUNT, amount: vnd(99_999_999_000), content: CODE });
const qrScreen = (phase: Parameters<typeof QrPanel>[0]["phase"]) =>
  overTheSale(
    <PaymentDrawer
      subtitle={HOSTILE_NAMES.branch}
      amountDue={vnd(99_999_999_000)}
      qrAccountSet
      initialWay="qr"
      onQr={nothing}
      onLeaveQr={async () => true}
      qrBusy={false}
      onBack={nothing}
      onPaid={never}
      qrPanel={() => (
        <QrPanel
          amount={vnd(99_999_999_000)}
          account={ACCOUNT}
          qr={{ contentCode: CODE, payload }}
          phase={phase}
          error={null}
          busy={false}
          onLeave={nothing}
          onRenew={nothing}
          onRetryPay={nothing}
          onCloseWithSettledQr={nothing}
          onCashForRest={nothing}
          onQrForRest={nothing}
        />
      )}
    />,
  );
const lookup = { code: HOSTILE_INVOICE.lookupCode, url: HOSTILE_INVOICE.lookupUrl };
const reprinted = billSlip(hostileSaleMenu, HOSTILE_SALE, Date.now(), lookup);

export const QR_AND_INVOICE_SCREENS = {
  "qr-payment": () => qrScreen({ kind: "waiting", secondsLeft: 899 }),
  "qr-payment-refused": () => qrScreen({ kind: "refused", code: "SYNC_ORDER_HAS_SETTLED_QR" }),
  "buyer-info": () => (
    <BuyerInfoScreen
      header={null}
      buyer={{
        taxCode: "0312345678-001",
        name: `${HOSTILE_NAMES.branch}${HOSTILE_NAMES.staff}`,
        address: HOSTILE_NAMES.emoji,
        email: "ke-toan-truong-chi-nhanh-quan-binh-thanh@congty-rat-dai.vn",
      }}
      onSave={never}
      onBack={nothing}
    />
  ),
  "sale-done-invoice": () => (
    <SaleDoneScreen
      header={null}
      sale={HOSTILE_SALE}
      slips={[{ job: reprinted, outcome: { status: "preview_only" } }]}
      invoice={
        <SaleInvoicePanel
          invoice={HOSTILE_INVOICE}
          buyer={null}
          reprinting={false}
          onEditBuyer={nothing}
          onReprint={nothing}
        />
      }
      onNextOrder={nothing}
    />
  ),
} satisfies Record<string, () => ReactElement>;
