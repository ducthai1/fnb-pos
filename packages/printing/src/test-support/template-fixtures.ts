import { type LocalClockParts, basisPoints, quantity, vnd } from "@fnb/domain";
import type { BillInput } from "../templates/bill-template";
import type { CupLabelInput } from "../templates/cup-label-template";
import type { KitchenTicketInput } from "../templates/kitchen-ticket-template";
import type { ShiftCloseInput } from "../templates/shift-close-template";
import { HOSTILE } from "./hostile-print-data";

/** Tuesday 20 October 2026, 14:05 at the branch. */
export const AT_1405: LocalClockParts = {
  year: 2026,
  month: 10,
  day: 20,
  dayOfWeek: 2,
  minuteOfDay: 845,
};

/** Two milk teas with pearls and a coffee, 10% off, 5% service, VAT 8% on top, paid in cash. */
export const TABLE_BILL: BillInput = {
  shop: {
    name: "Cà Phê Phố Cổ",
    address: "12 Hàng Bạc, Hoàn Kiếm, Hà Nội",
    phone: "024 3826 0000",
  },
  orderNumber: "HD-0012",
  callNumber: "12",
  tableName: "Sân thượng 5",
  cashierName: "Ngọc Anh",
  printedAt: AT_1405,
  lines: [
    {
      name: "Trà sữa trân châu đường đen",
      quantity: quantity(2),
      unitPrice: vnd(35_000),
      amount: vnd(90_000),
      children: [
        { name: "Trân châu trắng", quantity: quantity(2), amount: vnd(20_000) },
        { name: "Ít đá", quantity: quantity(1), amount: null },
      ],
      note: "Một ly không đường",
    },
    {
      name: "Cà phê sữa đá",
      quantity: quantity(1),
      unitPrice: vnd(29_000),
      amount: vnd(29_000),
      children: [],
      note: null,
    },
  ],
  subtotal: vnd(119_000),
  discounts: [{ label: "Giảm 10% thành viên", amount: vnd(11_900) }],
  serviceCharge: vnd(5_355),
  pricesIncludeTax: false,
  taxes: [{ rate: basisPoints(800), amount: vnd(8_996) }],
  total: vnd(121_451),
  payments: [{ method: "Tiền mặt", amount: vnd(200_000) }],
  change: vnd(78_549),
  lookup: { code: "K26TAB0000012", url: "https://hoadon.example.vn/tra-cuu?ma=K26TAB0000012" },
  footer: "Cảm ơn quý khách!",
};

/** A takeaway bill with every hostile field, no table, no lookup, prices including tax. */
export const HOSTILE_BILL: BillInput = {
  ...TABLE_BILL,
  shop: { name: HOSTILE.longName, address: null, phone: null },
  callNumber: null,
  tableName: null,
  cashierName: null,
  lines: [
    {
      name: HOSTILE.longName,
      quantity: quantity(999),
      unitPrice: vnd(0),
      amount: vnd(0),
      children: HOSTILE.thirtyToppings
        .slice(0, 3)
        .map((name) => ({ name, quantity: quantity(1), amount: vnd(1_000_000) })),
      note: HOSTILE.multiLineNote,
    },
    {
      name: HOSTILE.emojiName,
      quantity: quantity("0.5"),
      unitPrice: vnd(1_234_567_890),
      amount: vnd(617_283_945),
      children: [],
      note: HOSTILE.commandNote,
    },
    {
      name: HOSTILE.decomposedName,
      quantity: quantity(1),
      unitPrice: vnd(45_000),
      amount: vnd(45_000),
      children: [],
      note: null,
    },
  ],
  pricesIncludeTax: true,
  serviceCharge: null,
  discounts: [],
  lookup: null,
  footer: null,
  change: vnd(0),
};

export const BAR_TICKET: KitchenTicketInput = {
  stationName: "QUẦY BAR",
  orderNumber: "HD-0012",
  callNumber: "12",
  tableName: "5",
  printedAt: AT_1405,
  lines: [
    {
      kind: "new",
      name: "Trà sữa trân châu",
      quantity: quantity(2),
      note: "Ít đá",
      previousNote: null,
      children: [
        { name: "Trân châu trắng", quantity: quantity(2) },
        { name: "Size L", quantity: quantity(1) },
      ],
    },
    {
      kind: "cancel",
      name: "Cà phê sữa đá",
      quantity: quantity(1),
      note: null,
      previousNote: null,
      children: [],
    },
    {
      kind: "note_changed",
      name: "Trà đào cam sả",
      quantity: quantity(1),
      note: "Không đá",
      previousNote: "Ít đá",
      children: [],
    },
    {
      kind: "new",
      name: HOSTILE.longName,
      quantity: quantity(1),
      note: HOSTILE.multiLineNote,
      previousNote: null,
      children: [],
    },
  ],
};

export const EVENING_SHIFT: ShiftCloseInput = {
  shopName: "Cà Phê Phố Cổ",
  staffName: "Ngọc Anh",
  openedAt: { ...AT_1405, minuteOfDay: 840 },
  closedAt: { ...AT_1405, minuteOfDay: 1320 },
  methods: [
    { method: "Tiền mặt", expected: vnd(3_250_000), counted: vnd(3_200_000) },
    { method: "Chuyển khoản VietQR", expected: vnd(5_480_000), counted: vnd(5_480_000) },
    { method: "Thẻ", expected: vnd(1_000_000), counted: vnd(1_020_000) },
    { method: "Ví điện tử", expected: vnd(240_000), counted: null },
  ],
};

export const TWO_ITEM_CUPS: CupLabelInput = {
  callNumber: "12",
  printedAt: AT_1405,
  items: [
    {
      name: "Trà sữa trân châu",
      quantity: quantity(2),
      size: "L",
      sugar: "50%",
      ice: "Ít",
      toppings: ["Trân châu trắng"],
      note: null,
    },
    {
      name: "Trà đào cam sả",
      quantity: quantity(1),
      size: "M",
      sugar: null,
      ice: null,
      toppings: [],
      note: "Không đá",
    },
  ],
};
