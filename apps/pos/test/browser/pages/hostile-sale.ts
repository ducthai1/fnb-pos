import type { OrderEInvoiceSnapshot } from "@fnb/contracts";
import { vnd } from "@fnb/domain";
import { priceCounterOrder } from "../../../src/features/order/price-counter-order";
import type { PaidSale } from "../../../src/features/printing/paid-sale";
import { hostileTillMenu } from "../../../src/test-support/hostile-menu";
import { HOSTILE_NAMES } from "../../../src/test-support/hostile-names";
import { HOSTILE_ORDER } from "../../../src/test-support/hostile-order";

// A paid sale of the worst data, and its issued e-invoice, for the screens after payment.

export const hostileSaleMenu = hostileTillMenu();
const profile = { pricesIncludeTax: false, serviceCharge: null };
// Three cups rather than 999: the labels of every cup are on the screen.
const order = {
  ...HOSTILE_ORDER,
  lines: HOSTILE_ORDER.lines.map((line) => ({ ...line, quantity: 3 })),
};
const priced = priceCounterOrder(hostileSaleMenu, order, profile, Date.now());

export const HOSTILE_SALE: PaidSale = {
  order,
  priced,
  chargeProfile: profile,
  businessDate: "2026-10-20",
  version: 2,
  tenders: [
    {
      method: "qr_transfer",
      amount: vnd(1_000),
      paymentIntentId: "0199f000-0000-7000-8000-00000000a001",
    },
    { method: "cash", amount: vnd(500_000_000) },
  ],
  payments: [{ method: "cash", amount: priced.totals.amountDue }],
  change: vnd(99_999_999_000),
  paidAt: Date.now(),
  cashierName: HOSTILE_NAMES.staff,
};

/** An issued invoice whose provider hands out long codes with nowhere to wrap. */
export const HOSTILE_INVOICE = {
  id: "0199f000-0000-7000-8000-00000000e001",
  status: "issued",
  number: "0000000000000000000000000000000000000042",
  templateSymbol: "1C26MAA",
  taxAuthorityCode: "M1-26-ABCDE-00000000000000000000000000000000042",
  lookupCode: "TRACUU7K2M9QXA8TRACUU7K2M9QXA8TRACUU7K2M9QXA8TRACUU7K2M9QXA8",
  lookupUrl: "https://tracuu.example.vn/hoadon?ma=TRACUU7K2M9QXA8TRACUU7K2M9QXA8TRACUU7K2M9",
} as const satisfies OrderEInvoiceSnapshot;
