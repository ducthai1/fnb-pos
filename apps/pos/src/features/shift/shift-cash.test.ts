import type { SyncCommandEnvelope } from "@fnb/contracts";
import { expectedCash, vnd } from "@fnb/domain";
import { describe, expect, it } from "vitest";
import { closeToleranceOf } from "./close-tolerance";
import { cashMoveActionFor, tillShiftLedger, waitingShiftCash } from "./shift-cash";
import { readStoredShift } from "./stored-shift";

const TILL = "0199f000-0000-7000-8000-00000000d001";
const SHIFT = "0199f100-0000-7000-8000-000000000001";
const OTHER_SHIFT = "0199f0ff-0000-7000-8000-000000000001";

/** The shift as the server sent it: a table opened last shift paid 29.000 đ cash into it. */
const shift = readStoredShift({
  id: SHIFT,
  deviceId: TILL,
  status: "open",
  businessDate: "2026-10-20",
  version: 4,
  openedByStaffId: "lan",
  figures: {
    openingCash: 500_000,
    cashSales: 29_000,
    cashRefunds: 9_000,
    cashIn: 100_000,
    cashOut: 50_000,
    expectedCash: 570_000,
  },
  close: null,
})!;

const command = (type: string, payload: Record<string, unknown>) =>
  ({ type, payload }) as unknown as SyncCommandEnvelope;
const cash = (amount: number) => ({ method: "cash", amount });

describe("the shift's cash book as the till counts against it", () => {
  it("is the server's figures for the shift, cash carried in from any order included", () => {
    const ledger = tillShiftLedger(shift, []);
    // 500.000 + 29.000 − 9.000 + 100.000 − 50.000: what the server holds, to the đồng.
    expect(expectedCash(ledger)).toBe(vnd(570_000));
  });

  it("adds the till's cash still waiting for the server under this shift, and nothing else", () => {
    const waiting = waitingShiftCash(
      [
        command("order.pay", { shiftId: SHIFT, payments: [cash(35_000)] }),
        command("order.pay", { shiftId: SHIFT, payments: [{ method: "qr_transfer", amount: 1 }] }),
        command("order.refund", { shiftId: SHIFT, payouts: [cash(-6_000)] }),
        command("order.pay", { shiftId: OTHER_SHIFT, payments: [cash(40_000)] }),
        command("order.save_draft", { shiftId: SHIFT, payments: [cash(50_000)] }),
        command("shift.cash_move", { kind: "out", amount: 70_000 }),
      ],
      SHIFT,
    );
    expect(waiting).toEqual([
      { kind: "cash_sale", amount: vnd(35_000) },
      { kind: "cash_refund", amount: vnd(6_000) },
    ]);
    expect(expectedCash(tillShiftLedger(shift, waiting))).toBe(vnd(599_000));
  });

  it("judges a cash move on everything moved through the drawer once it is made, in its shift", () => {
    expect(cashMoveActionFor(shift, "lan", "out", vnd(400_000))).toEqual({
      key: "cash_move",
      amount: vnd(550_000),
      subject: { shiftId: shift.id },
    });
    // Another cashier on the same drawer: the cap is the shift's, as the server judges it.
    expect(cashMoveActionFor(shift, "minh", "in", vnd(10_000))).toEqual({
      key: "cash_move",
      amount: vnd(160_000),
      subject: { shiftId: shift.id },
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
