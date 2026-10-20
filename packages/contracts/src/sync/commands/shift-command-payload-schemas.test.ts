import { describe, expect, it } from "vitest";
import { outcomeOf, refusedPathsOf } from "../../zod-issue-test-helpers";
import {
  cashMovePayloadSchema,
  closeShiftPayloadSchema,
  openShiftPayloadSchema,
} from "./shift-command-payload-schemas";

const id = (n: number) => `0192f5a4-7c3e-7d10-8b2a-${String(n).padStart(12, "0")}`;
const notes = [{ denomination: 500_000, pieces: 2 }];

describe("openShiftPayloadSchema", () => {
  it("accepts a float with or without its notes, and an empty drawer", () => {
    const opened = { shiftId: id(1), openingCash: 1_000_000 };
    expect(outcomeOf(openShiftPayloadSchema, opened).ok).toBe(true);
    expect(outcomeOf(openShiftPayloadSchema, { ...opened, denominations: notes }).ok).toBe(true);
    expect(outcomeOf(openShiftPayloadSchema, { ...opened, openingCash: 0 }).ok).toBe(true);
  });

  it.each([
    ["a negative float", { openingCash: -1 }, "openingCash"],
    ["a float in decimals", { openingCash: 1.5 }, "openingCash"],
    ["a shift id that is not a uuid", { shiftId: "ca-sang" }, "shiftId"],
  ])("refuses %s", (_label, change, path) => {
    const sent = { shiftId: id(1), openingCash: 1_000_000, ...change };
    expect(refusedPathsOf(openShiftPayloadSchema, sent)).toEqual([path]);
  });
});

describe("cashMovePayloadSchema", () => {
  const move = { cashMoveId: id(2), kind: "out", amount: 50_000, reason: "Trả tiền đá" };

  it("accepts a move, with the approval it relies on", () => {
    expect(outcomeOf(cashMovePayloadSchema, { ...move, approvalId: id(3) }).ok).toBe(true);
  });

  it.each([
    ["a zero amount", { amount: 0 }, "amount"],
    ["a kind other than in or out", { kind: "transfer" }, "kind"],
    ["a reason of spaces only", { reason: "   " }, "reason"],
    ["an approval that is not a uuid", { approvalId: "quan-ly" }, "approvalId"],
  ])("refuses %s", (_label, change, path) => {
    expect(refusedPathsOf(cashMovePayloadSchema, { ...move, ...change })).toEqual([path]);
  });
});

describe("closeShiftPayloadSchema", () => {
  it("accepts a count with its notes", () => {
    expect(
      outcomeOf(closeShiftPayloadSchema, { counted: 1_000_000, denominations: notes }).ok,
    ).toBe(true);
  });

  it.each([
    ["a count without its notes", { counted: 1_000_000 }, "denominations"],
    ["a negative count", { counted: -1, denominations: notes }, "counted"],
    [
      "a negative number of notes",
      { counted: 0, denominations: [{ denomination: 500_000, pieces: -1 }] },
      "denominations.0.pieces",
    ],
  ])("refuses %s", (_label, sent, path) => {
    expect(refusedPathsOf(closeShiftPayloadSchema, sent)).toEqual([path]);
  });
});
