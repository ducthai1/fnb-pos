import type { OrderEInvoiceSnapshot } from "@fnb/contracts";
import { vnd } from "@fnb/domain";
import type { CounterOrder } from "../../src/features/order/counter-order";
import { priceCounterOrder } from "../../src/features/order/price-counter-order";
import type { PaidSale } from "../../src/features/printing/paid-sale";
import { tid } from "../../src/test-support/till-fixtures";
import { OPT, P, PROFILE, SIZE, prettyTillMenu } from "./pretty-menu";

// A guest's order at the sample café, paid in cash, and its e-invoice.

export const menu = prettyTillMenu();
export const now = Date.now();
export const STAFF = { cashier: "Lan", barista: "Minh", manager: "Hùng" };

export const ORDER: CounterOrder = {
  orderId: tid(0x9600),
  deviceOrderNo: 27,
  serviceType: "takeaway",
  tableTag: null,
  table: null,
  lines: [
    {
      lineId: tid(0x9601),
      productId: P["Trà sữa trân châu"]!,
      variantId: SIZE.l,
      modifiers: [
        { groupId: OPT.sugar, optionId: OPT.sugar50, quantity: 1 },
        { groupId: OPT.ice, optionId: OPT.iceLess, quantity: 1 },
        { groupId: OPT.topping, optionId: OPT.pearl, quantity: 1 },
      ],
      quantity: 2,
      note: "Đá riêng",
    },
    {
      lineId: tid(0x9602),
      productId: P["Cà phê muối"]!,
      variantId: null,
      modifiers: [{ groupId: OPT.ice, optionId: OPT.iceNormal, quantity: 1 }],
      quantity: 1,
      note: null,
    },
    {
      lineId: tid(0x9603),
      productId: P["Bạc xỉu"]!,
      variantId: null,
      modifiers: [
        { groupId: OPT.ice, optionId: OPT.iceLess, quantity: 1 },
        { groupId: OPT.extras, optionId: OPT.shot, quantity: 1 },
      ],
      quantity: 1,
      note: null,
    },
  ],
};

export const PRICED = priceCounterOrder(menu, ORDER, PROFILE, now);
const due = PRICED.totals.amountDue;
const given = vnd(Math.ceil(Number(due) / 50_000) * 50_000);

export const SALE: PaidSale = {
  order: ORDER,
  priced: PRICED,
  chargeProfile: PROFILE,
  businessDate: "2026-10-21",
  version: 2,
  tenders: [{ method: "cash", amount: given }],
  payments: [{ method: "cash", amount: due }],
  change: vnd(Number(given) - Number(due)),
  paidAt: now,
  cashierName: STAFF.cashier,
};

export const INVOICE = {
  id: tid(0x96e1),
  status: "issued",
  number: "00000127",
  templateSymbol: "1C26MAA",
  taxAuthorityCode: "M1-26-7K2M9-00000000127",
  lookupCode: "K7Q2M9XA8",
  lookupUrl: "https://tracuu.example.vn/hoadon?ma=K7Q2M9XA8",
} as const satisfies OrderEInvoiceSnapshot;
