import { describe, expect, it } from "vitest";
import { quantity } from "../money";
import { line, order } from "../order/order-line-test-fixtures";
import type { OrderLine } from "../order/order-types";
import { diffKitchenTicket } from "./diff-kitchen-ticket";
import { byProduct, cancel, send, topping } from "./kitchen-test-fixtures";

const combo = (qty: number, productId = "product-breakfast"): OrderLine => ({
  ...line("combo", "item", null, quantity(qty)),
  productId,
  nameSnapshot: "Combo sáng",
});

const pick = (id: string, productId: string): OrderLine => ({
  ...line(id, "combo_component", "combo"),
  productId,
  nameSnapshot: `pick ${id}`,
});

/** Tea for the bar with a topping, a cake for the kitchen, bottled water for nobody. */
const breakfast = (qty = 1) =>
  order([
    combo(qty),
    pick("tea", "product-tea"),
    topping("pearl", "tea"),
    pick("cake", "product-cake"),
    pick("water", "product-water"),
  ]);

const ticketsOf = (diff: ReturnType<typeof send>) =>
  diff.tickets.map((ticket) => ({
    station: ticket.stationId,
    lines: ticket.lines.map((l) => ({
      kind: l.kind,
      lineId: l.lineId,
      quantity: l.quantity,
      children: l.children.map((child) => `${child.lineId}@${child.depth}`),
    })),
  }));

describe("kitchen tickets for a combo", () => {
  it("sends each pick to its own station under the combo, and records the combo once", () => {
    const diff = send(breakfast(2), []);
    expect(ticketsOf(diff)).toEqual([
      {
        station: "bar",
        lines: [
          { kind: "new", lineId: "combo", quantity: quantity(2), children: ["tea@1", "pearl@2"] },
        ],
      },
      {
        station: "kitchen",
        lines: [{ kind: "new", lineId: "combo", quantity: quantity(2), children: ["cake@1"] }],
      },
    ]);
    expect(diff.sentState).toEqual([
      { lineId: "combo", sentQuantity: quantity(2), sentNote: null },
    ]);
  });

  it("sends a pick no station makes where the combo itself is made", () => {
    const routing = (l: OrderLine) =>
      l.productId === "product-breakfast" ? "counter" : byProduct(l);
    const diff = diffKitchenTicket(breakfast(), [], routing);
    expect(diff.tickets.map((t) => [t.stationId, t.lines[0]?.children.map((c) => c.lineId)])).toEqual(
      [
        ["bar", ["tea", "pearl"]],
        ["kitchen", ["cake"]],
        ["counter", ["water"]],
      ],
    );
  });

  it("prints nothing and records nothing when neither the combo nor any pick is made anywhere", () => {
    const diff = send(order([combo(1), pick("water", "product-water")]), []);
    expect(diff.tickets).toEqual([]);
    expect(diff.sentState).toEqual([]);
  });

  it("cancels a sent combo at every station that made a part of it", () => {
    const first = breakfast(2);
    const sent = send(first, []).sentState;
    const voided = cancel(first, sent, "combo", 1);
    const diff = send(voided.order, sent);
    expect(
      diff.tickets.map((t) => [t.stationId, t.lines.map((l) => `${l.kind} ${l.quantity}`)]),
    ).toEqual([
      ["bar", [`cancel ${quantity(1)}`]],
      ["kitchen", [`cancel ${quantity(1)}`]],
    ]);
    expect(diff.tickets[1]?.lines[0]?.children.map((c) => c.name)).toEqual(["pick cake"]);
  });
});
