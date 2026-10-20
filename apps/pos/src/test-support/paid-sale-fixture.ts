import { vnd } from "@fnb/domain";
import { NO_MENU_COPIES, buildTillMenu } from "../features/menu/till-menu";
import type { CounterOrder } from "../features/order/counter-order";
import { priceCounterOrder } from "../features/order/price-counter-order";
import type { PaidSale } from "../features/printing/paid-sale";
import { MENU, tid, tillBootstrap } from "./till-fixtures";

export const SALE_MENU = buildTillMenu(tillBootstrap(), NO_MENU_COPIES, new Set());
export const PLACE = {
  deviceId: tid(0xd001),
  branchId: SALE_MENU.branch.id,
  utcOffsetMinutes: 420,
  businessDayStartMinute: 240,
};
const AT = Date.UTC(2026, 9, 20, 3, 0);
const PROFILE = { pricesIncludeTax: true, serviceCharge: null };

/** Two L milk teas with pearls (bar, cup labels), a coffee (bar) and a cake (no station). */
export const SOLD: CounterOrder = {
  orderId: tid(0x800),
  deviceOrderNo: 101,
  serviceType: "takeaway",
  tableTag: null,
  lines: [
    {
      lineId: tid(0x801),
      productId: MENU.milkTea,
      variantId: MENU.sizeL,
      modifiers: [
        { groupId: MENU.sugar, optionId: MENU.sugarHalf, quantity: 1 },
        { groupId: MENU.toppings, optionId: MENU.pearl, quantity: 1 },
      ],
      quantity: 2,
      note: "Ít đá",
    },
    {
      lineId: tid(0x802),
      productId: MENU.coffee,
      variantId: null,
      modifiers: [],
      quantity: 1,
      note: null,
    },
    {
      lineId: tid(0x803),
      productId: MENU.cake,
      variantId: null,
      modifiers: [],
      quantity: 1,
      note: null,
    },
  ],
};

export function paidSale(): PaidSale {
  const priced = priceCounterOrder(SALE_MENU, SOLD, PROFILE, AT);
  return {
    order: SOLD,
    priced,
    chargeProfile: PROFILE,
    businessDate: "2026-10-20",
    version: 3,
    tenders: [{ method: "cash", amount: vnd(200_000) }],
    payments: [{ method: "cash", amount: priced.totals.amountDue }],
    change: vnd(46_000),
    paidAt: AT,
    cashierName: "Lan",
  };
}
