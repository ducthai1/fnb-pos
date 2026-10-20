import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type Vnd, addVnd, subtractVnd, vnd } from "../money";
import { codeOf } from "../order/order-line-test-fixtures";
import {
  type ShiftCashEvent,
  type ShiftCashLedger,
  cashMoveAction,
  cumulativeCashMovedInShift,
  expectedCash,
  netCashOf,
  summarizeShiftCash,
} from "./expected-cash";
import { SHIFT_ERROR_CODES as C } from "./shift-error-codes";

const sale = (amount: number): ShiftCashEvent => ({ kind: "cash_sale", amount: vnd(amount) });
const refund = (amount: number): ShiftCashEvent => ({ kind: "cash_refund", amount: vnd(amount) });
const cashIn = (amount: number, staffId = "lan"): ShiftCashEvent => ({
  kind: "cash_in",
  amount: vnd(amount),
  staffId,
});
const cashOut = (amount: number, staffId = "lan") =>
  ({ kind: "cash_out", amount: vnd(amount), staffId }) as const;
const ledger = (openingCash: number, ...events: ShiftCashEvent[]): ShiftCashLedger => ({
  openingCash: vnd(openingCash),
  events,
});

describe("summarizeShiftCash", () => {
  it("expects the float plus cash sales and cash in, less cash refunds and cash out", () => {
    const shift = ledger(500_000, sale(120_000), sale(45_000), refund(30_000), cashIn(200_000));
    expect(summarizeShiftCash({ ...shift, events: [...shift.events, cashOut(50_000)] })).toEqual({
      openingCash: vnd(500_000),
      cashSales: vnd(165_000),
      cashRefunds: vnd(30_000),
      cashIn: vnd(200_000),
      cashOut: vnd(50_000),
      expectedCash: vnd(785_000),
    });
  });

  it("expects exactly the float of a shift that took no cash", () => {
    expect(expectedCash(ledger(300_000))).toBe(vnd(300_000));
  });

  it("can expect less than nothing when refunds paid out more than the drawer took", () => {
    expect(expectedCash(ledger(0, sale(10_000), refund(25_000)))).toBe(vnd(-15_000));
  });

  it("refuses a signed amount, so a refund cannot be booked as takings", () => {
    expect(codeOf(() => expectedCash(ledger(0, sale(-10_000))))).toBe(C.negativeAmount);
    expect(codeOf(() => expectedCash(ledger(-1)))).toBe(C.negativeAmount);
  });
});

describe("netCashOf", () => {
  it("is what late sales and refunds add to a drawer, without its float", () => {
    expect(netCashOf([sale(50_000), refund(20_000)])).toBe(vnd(30_000));
    expect(netCashOf([refund(20_000)])).toBe(vnd(-20_000));
  });
});

describe("cumulativeCashMovedInShift", () => {
  it("adds every move of the shift as a magnitude, in and out alike, whoever made it", () => {
    const shift = ledger(0, cashIn(400_000), cashOut(400_000), cashOut(100_000, "minh"));
    expect(cumulativeCashMovedInShift(shift)).toBe(vnd(900_000));
  });

  it("does not count sales or refunds, which need no cash_move key", () => {
    expect(cumulativeCashMovedInShift(ledger(0, sale(900_000), refund(900_000)))).toBe(vnd(0));
  });

  it("judges a new move by the drawer's total once it is made, the other cashier's included", () => {
    const shift = ledger(0, cashOut(300_000), cashOut(300_000, "minh"));
    expect(cashMoveAction(shift, cashOut(300_000))).toEqual({
      key: "cash_move",
      amount: vnd(900_000),
    });
  });
});

const amount = fc.integer({ min: 0, max: 5_000_000 });
const staffId = fc.constantFrom("lan", "minh", "hoa");
const event: fc.Arbitrary<ShiftCashEvent> = fc.oneof(
  fc
    .record({ kind: fc.constantFrom("cash_sale", "cash_refund"), amount })
    .map((e): ShiftCashEvent => ({ kind: e.kind, amount: vnd(e.amount) })),
  fc
    .record({ kind: fc.constantFrom("cash_in", "cash_out"), amount, staffId })
    .map((e): ShiftCashEvent => ({ kind: e.kind, amount: vnd(e.amount), staffId: e.staffId })),
);
const shiftLedger = fc
  .record({ openingCash: amount, events: fc.array(event, { maxLength: 30 }) })
  .map((s): ShiftCashLedger => ({ openingCash: vnd(s.openingCash), events: s.events }));

const signed = (e: ShiftCashEvent): Vnd =>
  e.kind === "cash_sale" || e.kind === "cash_in" ? e.amount : subtractVnd(vnd(0), e.amount);

describe("expected cash properties", () => {
  it("does not depend on the order the events arrived in", () => {
    const shuffled = shiftLedger.chain((shift) =>
      fc
        .shuffledSubarray([...shift.events], {
          minLength: shift.events.length,
          maxLength: shift.events.length,
        })
        .map((events) => ({ shift, reordered: { ...shift, events } })),
    );
    fc.assert(
      fc.property(shuffled, ({ shift, reordered }) => {
        expect(summarizeShiftCash(reordered)).toEqual(summarizeShiftCash(shift));
        expect(cumulativeCashMovedInShift(reordered)).toBe(cumulativeCashMovedInShift(shift));
      }),
    );
  });

  it("equals the float plus every event with the sign its kind gives it", () => {
    fc.assert(
      fc.property(shiftLedger, (shift) => {
        const total = addVnd(shift.openingCash, ...shift.events.map(signed));
        expect(expectedCash(shift)).toBe(total);
      }),
    );
  });

  it("splits into the cash book so far plus what later events add", () => {
    fc.assert(
      fc.property(shiftLedger, fc.array(event, { maxLength: 10 }), (shift, late) => {
        const all = { ...shift, events: [...shift.events, ...late] };
        expect(expectedCash(all)).toBe(addVnd(expectedCash(shift), netCashOf(late)));
      }),
    );
  });

  it("does not depend on who made each move, so signing in as someone else moves no cap", () => {
    const renamed = shiftLedger.chain((shift) =>
      fc.array(staffId, { minLength: shift.events.length, maxLength: shift.events.length }).map(
        (ids) => ({
          shift,
          renamed: {
            ...shift,
            events: shift.events.map((e, i) =>
              e.kind === "cash_in" || e.kind === "cash_out" ? { ...e, staffId: ids[i] ?? e.staffId } : e,
            ),
          },
        }),
      ),
    );
    fc.assert(
      fc.property(renamed, ({ shift, renamed: other }) => {
        const moves = shift.events.filter((e) => e.kind === "cash_in" || e.kind === "cash_out");
        expect(cumulativeCashMovedInShift(other)).toBe(cumulativeCashMovedInShift(shift));
        expect(cumulativeCashMovedInShift(shift)).toBe(addVnd(...moves.map((e) => e.amount)));
      }),
    );
  });
});
