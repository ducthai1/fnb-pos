import { vnd } from "@fnb/domain";
import type { ReactElement } from "react";
import { priceCounterOrder } from "../../../src/features/order/price-counter-order";
import { billSlip } from "../../../src/features/printing/bill-slip";
import { cupLabelSlip } from "../../../src/features/printing/cup-label-slip";
import { kitchenSlips } from "../../../src/features/printing/kitchen-slips";
import type { PaidSale } from "../../../src/features/printing/paid-sale";
import { PaymentScreen } from "../../../src/screens/payment/payment-screen";
import { SaleDoneScreen } from "../../../src/screens/payment/sale-done-screen";
import { hostileTillMenu } from "../../../src/test-support/hostile-menu";
import { HOSTILE_NAMES } from "../../../src/test-support/hostile-names";
import { HOSTILE_ORDER } from "../../../src/test-support/hostile-order";

// Taking the money and the slips after it, with the worst data; see screens-page.tsx.

const menu = hostileTillMenu();
const never = () => new Promise<never>(() => {});
const profile = { pricesIncludeTax: false, serviceCharge: null };
// Three cups rather than 999: the labels of every cup are on the screen.
const order = {
  ...HOSTILE_ORDER,
  lines: HOSTILE_ORDER.lines.map((line) => ({ ...line, quantity: 3 })),
};
const priced = priceCounterOrder(menu, order, profile, Date.now());
const sale: PaidSale = {
  order,
  priced,
  chargeProfile: profile,
  businessDate: "2026-10-20",
  version: 2,
  tenders: [
    { method: "qr_transfer", amount: vnd(1_000) },
    { method: "cash", amount: vnd(500_000_000) },
  ],
  payments: [{ method: "cash", amount: priced.totals.amountDue }],
  change: vnd(99_999_999_000),
  paidAt: Date.now(),
  cashierName: HOSTILE_NAMES.staff,
};
const at = Date.now();
const jobs = [
  ...kitchenSlips(menu, sale, at).map((ticket) => ticket.job),
  cupLabelSlip(menu, sale, at),
  billSlip(menu, sale, at),
].flatMap((job) => (job === null ? [] : [job]));

export const CHECKOUT_SCREENS = {
  payment: () => (
    <PaymentScreen header={null} amountDue={vnd(99_999_999_000)} onBack={() => {}} onPaid={never} />
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
