// Which screens the till's handbook shows, and at which widths: 1280 is a till on a counter,
// 360 a phone. Each picture lands in docs/handbook/images/may-quay/<screen>[-<width>].webp.

export interface HandbookShot {
  readonly screen: string;
  readonly width: number;
  readonly height: number;
  /** Buttons tapped before the picture, by the start of their name, and how many times. */
  readonly taps?: readonly (readonly [string, number])[];
}

/** Taps that fill a screen in: the drawer counted note by note, a discount, a refund. */
const TAPS: Readonly<Record<string, readonly (readonly [string, number])[]>> = {
  "open-shift": [
    ["+ 200.000", 2],
    ["+ 100.000", 1],
  ],
  discount: [["Giảm 20%", 1]],
  "theme-menu": [["Giao diện", 1]],
  "update-banner-folded": [["Thu nhỏ thẻ cập nhật", 1]],
  "order-history-order": [["Xem đơn số 26", 1]],
  "void-line": [["Pha/làm sai món", 1]],
  refund: [
    ["Thêm một Trà sữa trân châu", 1],
    ["Khách trả lại món", 1],
  ],
  "close-shift": [
    ["+ 500.000", 3],
    ["+ 200.000", 1],
    ["+ 50.000", 1],
    ["+ 20.000", 2],
  ],
};

const TILL = [
  "pairing",
  "staff-picker",
  "pin-entry",
  "blocked",
  "crash",
  "bootstrap-failed",
  "open-shift",
  "sale",
  "unpaid-orders-strip",
  "theme-menu",
  "modifier-picker",
  "line-entry-weight",
  "combo-picker",
  "payment",
  "qr-payment",
  "qr-payment-refused",
  "buyer-info",
  "sale-done",
  "sale-done-invoice",
  "floor",
  "floor-plan",
  "table-order",
  "transfer-table",
  "table-slips",
  "approval-sheet",
  "sale-adjusted",
  "void-line",
  "discount",
  "cancel-order",
  "cash-move",
  "close-shift",
  "order-history",
  "order-history-order",
  "refund",
  "refund-and-close-slips",
  "close-shift-slip",
  "needs-attention",
  "sale-offline",
  "update-banner",
  "update-banner-folded",
];
const PHONE = ["sale", "modifier-picker", "payment"];

export const HANDBOOK_SHOTS: readonly HandbookShot[] = [
  ...TILL.map((screen) => ({ screen, width: 1280, height: 800, taps: TAPS[screen] })),
  ...PHONE.map((screen) => ({ screen, width: 360, height: 740 })),
];

export const shotFileName = (shot: HandbookShot) =>
  shot.width === 1280 ? `${shot.screen}.webp` : `${shot.screen}-${shot.width}.webp`;

/** The most a picture in the handbook may weigh. */
export const MAX_SHOT_BYTES = 150 * 1024;
