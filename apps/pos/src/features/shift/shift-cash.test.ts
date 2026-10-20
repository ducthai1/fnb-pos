import { expectedCash, vnd } from "@fnb/domain";
import { describe, expect, it } from "vitest";
import type { StoredOrder } from "../order/stored-order";
import { closeToleranceOf } from "./close-tolerance";
import { cashMoveActionFor, tillShiftLedger } from "./shift-cash";
import { readStoredShift } from "./stored-shift";

const TILL = "0199f000-0000-7000-8000-00000000d001";
// UUIDv7 ids sort by when they were made: the shift, then what came after it.
const SHIFT = "0199f100-0000-7000-8000-000000000001";
const BEFORE = "0199f0ff-0000-7000-8000-000000000001";
const AFTER = (n: number) => `0199f101-0000-7000-8000-00000000000${n}`;

const shift = readStoredShift({
  id: SHIFT,
  deviceId: TILL,
  status: "open",
  businessDate: "2026-10-20",
  version: 3,
  openedByStaffId: "lan",
  figures: {
    openingCash: 500_000,
    cashSales: 0,
    cashRefunds: 0,
    cashIn: 100_000,
    cashOut: 50_000,
    expectedCash: 550_000,
  },
  close: null,
})!;

const order = (orderId: string, fields: Partial<StoredOrder>): StoredOrder =>
  ({
    orderId,
    deviceId: TILL,
    status: "paid",
    refundOfOrderId: null,
    payments: [{ method: "cash", amount: vnd(29_000) }],
    ...fields,
  }) as StoredOrder;

describe("the shift's cash book as the till rebuilds it", () => {
  it("counts the float, the moves and the cash of the till's orders made in the shift", () => {
    const ledger = tillShiftLedger(
      shift,
      [
        order(AFTER(1), {}),
        order(AFTER(2), { payments: [{ method: "qr_transfer", amount: vnd(45_000) }] }),
        order(AFTER(3), {
          refundOfOrderId: AFTER(1),
          payments: [{ method: "cash", amount: vnd(-9_000) }],
        }),
        order(AFTER(4), { status: "draft" }),
        order(AFTER(5), { deviceId: "another-till" }),
        order(BEFORE, {}),
      ],
      "lan",
    );
    // 500.000 + 100.000 − 50.000 + 29.000 − 9.000
    expect(expectedCash(ledger)).toBe(vnd(570_000));
  });

  it("judges a cash move on everything moved in the shift once it is made", () => {
    expect(cashMoveActionFor(shift, "lan", "out", vnd(400_000))).toEqual({
      key: "cash_move",
      amount: vnd(550_000),
    });
  });

  it("refuses a shift row it cannot read rather than guess its figures", () => {
    expect(readStoredShift({ ...shift.row, figures: { openingCash: "500000" } })).toBeNull();
    expect(readStoredShift({ ...shift.row, figures: null })).toBeNull();
  });

  it("reads the shop's close tolerance, none meaning every difference", () => {
    expect(closeToleranceOf({ shift_close_difference_tolerance: "5000" })).toBe(vnd(5_000));
    expect(closeToleranceOf({})).toBe(vnd(0));
    expect(closeToleranceOf({ shift_close_difference_tolerance: "-1" })).toBe(vnd(0));
    expect(closeToleranceOf({ shift_close_difference_tolerance: 5000 })).toBe(vnd(0));
  });
});
