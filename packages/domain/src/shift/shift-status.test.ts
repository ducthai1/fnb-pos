import { describe, expect, it } from "vitest";
import { codeOf } from "../order/order-line-test-fixtures";
import { SHIFT_ERROR_CODES as C } from "./shift-error-codes";
import { type ShiftStatus, assertAcceptsCashMoves, transitionShift } from "./shift-status";

const STATUSES: ShiftStatus[] = ["opening", "open", "closing", "closed"];
const ALLOWED = new Set(["opening>open", "open>closing", "closing>open", "closing>closed"]);

describe("transitionShift", () => {
  it("opens after the float is counted, and closes only through a count", () => {
    expect(transitionShift("opening", "open")).toBe("open");
    expect(transitionShift(transitionShift("open", "closing"), "closed")).toBe("closed");
  });

  it("lets a count in progress be abandoned, back to an open shift", () => {
    expect(transitionShift("closing", "open")).toBe("open");
  });

  it("refuses every other move, closing without a count and reopening a closed shift among them", () => {
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        if (ALLOWED.has(`${from}>${to}`)) continue;
        expect(
          codeOf(() => transitionShift(from, to)),
          `${from} → ${to}`,
        ).toBe(C.invalidTransition);
      }
    }
  });
});

describe("assertAcceptsCashMoves", () => {
  it("takes cash moves on an open shift", () => {
    expect(codeOf(() => assertAcceptsCashMoves("open"))).toBeUndefined();
  });

  it("refuses them while the float or the drawer is being counted, and after the close", () => {
    for (const status of ["opening", "closing", "closed"] as const) {
      expect(codeOf(() => assertAcceptsCashMoves(status))).toBe(C.notOpen);
    }
  });
});
