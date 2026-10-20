import type { DayStatus } from "../lib/api/day-close-api";
import type { UnmatchedPayments } from "../lib/api/payments-api";
import type { DailySalesReport } from "../lib/api/reports-api";
import { BRANCHES } from "./fake-backoffice-api";

const id = (n: number) => `0190a000-0000-7000-8000-${(0xe00 + n).toString(16).padStart(12, "0")}`;
export const fixtureId = id;

/** A day as the server reports it, with a refund, two methods, a topping row and a void. */
export function dailySalesReport(itemName = "Trà sữa trân châu"): DailySalesReport {
  return {
    branchId: BRANCHES[0]!.id,
    businessDate: "2026-10-20",
    sales: {
      orderCount: 42,
      gross: 1_234_567,
      discount: 34_567,
      net: 1_200_000,
      serviceCharge: 60_000,
      tax: 93_333,
      taxByRate: [{ rate: 800, base: 1_166_667, tax: 93_333 }],
      netExcludingTax: 1_166_667,
      collected: 1_260_000,
    },
    refunds: { orderCount: 1, collected: -29_000, tax: -2_148, taxByRate: [] },
    payments: [
      { method: "cash", sales: 900_000, refunds: -29_000, net: 871_000 },
      { method: "qr_transfer", sales: 360_000, refunds: 0, net: 360_000 },
    ],
    byHour: [{ hour: 7, orderCount: 12, collected: 410_000 }],
    items: [
      {
        lineType: "item",
        productId: id(1),
        variantId: null,
        modifierOptionId: null,
        name: itemName,
        quantity: "12.5",
        gross: 437_500,
        discount: 0,
        net: 437_500,
        tax: 32_407,
      },
      {
        lineType: "modifier",
        productId: null,
        variantId: null,
        modifierOptionId: id(2),
        name: "Trân châu đen",
        quantity: "8",
        gross: 40_000,
        discount: 0,
        net: 40_000,
        tax: 2_963,
      },
    ],
    voids: { count: 2, value: 58_000, items: [] },
    cancelledOrders: 3,
    qrRefunds: { count: 1, amount: 20_000, byMethod: [{ method: "cash", count: 1, amount: 20_000 }] },
  };
}

/** A day nothing stops closing, as `GET …/day-close` answers it; `change` adds what is open. */
export const dayStatus = (change: Partial<DayStatus> = {}): DayStatus => ({
  dayClose: null,
  openShiftIds: [],
  openDrafts: [],
  paidAfterClose: [],
  unissuedInvoices: [],
  failedInvoices: [],
  unsentInvoices: [],
  ...change,
});

/** Two transfers nobody matched, two QRs waiting, one QR's money owed back. */
export function unmatchedPayments(): UnmatchedPayments {
  const intent = (n: number, code: string, amount: number, status: string, receivedAmount: number | null) => ({
    id: id(n),
    orderId: id(n + 50),
    branchId: BRANCHES[0]!.id,
    amount,
    contentCode: code,
    status,
    expiresAt: "2026-10-20T03:15:00.000Z",
    receivedAmount,
    version: 1,
  });
  return {
    transfers: [
      { id: id(10), gateway: "sepay", amount: 35_000, content: "chuyen tien tra sua", occurredAt: "2026-10-20T03:05:00.000Z", receivedAt: "2026-10-20T03:05:02.000Z" },
      { id: id(11), gateway: "sepay", amount: 64_000, content: "FNBQ7K2M9XA", occurredAt: "2026-10-20T03:20:00.000Z", receivedAt: "2026-10-20T03:20:01.000Z" },
    ],
    openIntents: [intent(20, "FNBA1B2C3D4", 35_000, "expired", null), intent(21, "FNBZ9Y8X7W6", 64_000, "pending", null)],
    refundDue: [intent(30, "FNBR5S6T7V8", 50_000, "overpaid", 70_000)],
  } as UnmatchedPayments;
}
