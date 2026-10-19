import { describe, expect, it } from "vitest";
import { ORDER_ERROR_CODES as C } from "./order-error-codes";
import { codeOf, item } from "./order-line-test-fixtures";
import { assertLinesEditable, assertTransition, transitionOrder } from "./order-state-machine";
import type { Order, OrderStatus } from "./order-types";

// from, to, refusal code (null = the transition is allowed)
const TRANSITIONS: [OrderStatus, OrderStatus, string | null][] = [
  ["draft", "draft", C.invalidTransition],
  ["draft", "paid", null],
  ["draft", "posted", C.invalidTransition],
  ["draft", "cancelled", null],
  ["paid", "draft", C.alreadyPaid],
  ["paid", "paid", C.alreadyPaid],
  ["paid", "posted", null],
  ["paid", "cancelled", C.alreadyPaid],
  ["posted", "draft", C.alreadyPosted],
  ["posted", "paid", C.alreadyPosted],
  ["posted", "posted", C.alreadyPosted],
  ["posted", "cancelled", C.alreadyPosted],
  ["cancelled", "draft", C.alreadyCancelled],
  ["cancelled", "paid", C.alreadyCancelled],
  ["cancelled", "posted", C.alreadyCancelled],
  ["cancelled", "cancelled", C.alreadyCancelled],
];

function frozenOrder(status: OrderStatus, version = 3): Order {
  const order: Order = {
    id: "order-1",
    status,
    serviceType: "dine_in",
    channelKey: null,
    businessDate: "2026-10-20",
    lines: Object.freeze([item("tea")]),
    version,
    refundOfOrderId: null,
  };
  // Frozen so that any in-place mutation throws instead of passing unnoticed.
  return Object.freeze(order);
}

describe("assertTransition", () => {
  it("the table covers all 16 status pairs once and allows exactly three", () => {
    expect(new Set(TRANSITIONS.map(([from, to]) => `${from}>${to}`)).size).toBe(16);
    const allowed = TRANSITIONS.filter(([, , code]) => code === null).map(([f, t]) => `${f}>${t}`);
    expect(allowed).toEqual(["draft>paid", "draft>cancelled", "paid>posted"]);
  });

  it.each(TRANSITIONS)("%s to %s gives %s (null = allowed)", (from, to, code) => {
    expect(codeOf(() => assertTransition(from, to)) ?? null).toBe(code);
  });
});

describe("transitionOrder", () => {
  it("returns a new paid order with the version bumped and leaves the draft untouched", () => {
    const draft = frozenOrder("draft");
    const paid = transitionOrder(draft, "paid");
    expect(paid).not.toBe(draft);
    expect(paid).toEqual({ ...draft, status: "paid", version: 4 });
    expect(draft.status).toBe("draft");
    expect(draft.version).toBe(3);
  });

  it("bumps the version on every step of draft, paid, posted", () => {
    const posted = transitionOrder(transitionOrder(frozenOrder("draft"), "paid"), "posted");
    expect(posted.status).toBe("posted");
    expect(posted.version).toBe(5);
  });

  it("refuses to cancel a paid order and leaves it as it was", () => {
    const paid = frozenOrder("paid");
    expect(codeOf(() => transitionOrder(paid, "cancelled"))).toBe(C.alreadyPaid);
    expect(paid.status).toBe("paid");
    expect(paid.version).toBe(3);
  });
});

describe("assertLinesEditable", () => {
  it("lets the lines of a draft be changed", () => {
    expect(codeOf(() => assertLinesEditable(frozenOrder("draft")))).toBeUndefined();
  });

  it.each<[OrderStatus, string]>([
    ["paid", C.alreadyPaid],
    ["posted", C.alreadyPosted],
    ["cancelled", C.alreadyCancelled],
  ])("refuses to change the lines of a %s order", (status, code) => {
    expect(codeOf(() => assertLinesEditable(frozenOrder(status)))).toBe(code);
  });
});
