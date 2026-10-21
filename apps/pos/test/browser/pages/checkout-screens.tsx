import { vnd } from "@fnb/domain";
import type { ReactElement } from "react";
import { billSlip } from "../../../src/features/printing/bill-slip";
import { cupLabelSlip } from "../../../src/features/printing/cup-label-slip";
import { kitchenSlips } from "../../../src/features/printing/kitchen-slips";
import { BuyerInvoiceOffer } from "../../../src/screens/invoice/sale-invoice-panel";
import { PaymentDrawer } from "../../../src/screens/payment/payment-drawer";
import { SaleDoneScreen } from "../../../src/screens/payment/sale-done-screen";
import { UnderLayer } from "../../../src/screens/shared/under-layer";
import { HOSTILE_NAMES } from "../../../src/test-support/hostile-names";
import { HOSTILE_SALE as sale, hostileSaleMenu as menu } from "./hostile-sale";
import { SALE_SCREENS } from "./sale-screens";

// Taking the money and the slips after it, with the worst data; see screens-page.tsx.

const never = () => new Promise<never>(() => {});
const at = Date.now();
const jobs = [
  ...kitchenSlips(menu, sale, at).map((ticket) => ticket.job),
  cupLabelSlip(menu, sale, at),
  billSlip(menu, sale, at),
].flatMap((job) => (job === null ? [] : [job]));

/** The payment drawer over the hostile order it pays, as the till shows it. */
export const overTheSale = (drawer: ReactElement) => (
  <>
    <UnderLayer covered>{SALE_SCREENS.sale()}</UnderLayer>
    {drawer}
  </>
);

export const CHECKOUT_SCREENS = {
  payment: () =>
    overTheSale(
      <PaymentDrawer
        subtitle={`${HOSTILE_NAMES.staff} · ${HOSTILE_NAMES.emoji}`}
        amountDue={vnd(99_999_999_000)}
        qrAccountSet
        invoice={
          <BuyerInvoiceOffer
            buyer={{ taxCode: "0312345678-001", name: HOSTILE_NAMES.branch }}
            onEdit={() => {}}
          />
        }
        onQr={() => {}}
        onLeaveQr={async () => true}
        qrPanel={() => null}
        qrBusy={false}
        onBack={() => {}}
        onPaid={never}
      />,
    ),
  "sale-done": () => (
    <SaleDoneScreen
      header={null}
      sale={sale}
      slips={jobs.map((job, index) => ({
        job,
        outcome:
          index === 0
            ? { status: "failed", attempts: 3, errorCode: HOSTILE_NAMES.unknownCode }
            : { status: "preview_only" },
      }))}
      onNextOrder={() => {}}
    />
  ),
} satisfies Record<string, () => ReactElement>;
