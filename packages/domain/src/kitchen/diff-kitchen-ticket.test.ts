import { describe, expect, it } from "vitest";
import { quantity } from "../money";
import { line, order } from "../order/order-line-test-fixtures";
import { diffKitchenTicket } from "./diff-kitchen-ticket";
import { cancel, dish, editLine, send, sentOf, topping, withLines } from "./kitchen-test-fixtures";

const summary = (diff: ReturnType<typeof send>) =>
  diff.tickets.map((t) => ({
    station: t.stationId,
    lines: t.lines.map((l) => `${l.kind} ${l.lineId} ${l.quantity}`),
  }));

describe("kitchen tickets for a new order", () => {
  it("sends every routed item once, toppings under their item, discounts left out", () => {
    const first = order([
      dish("tea", 2),
      topping("pearl", "tea", 2),
      { ...line("off", "discount", "tea"), nameSnapshot: "10% off" },
      dish("water", 1),
    ]);
    const diff = send(first, []);
    expect(summary(diff)).toEqual([{ station: "bar", lines: ["new tea 2000"] }]);
    expect(diff.tickets[0]?.lines[0]?.children).toEqual([
      {
        lineId: "pearl",
        lineType: "modifier",
        name: "topping pearl",
        quantity: quantity(2),
        note: null,
        depth: 1,
      },
    ]);
    expect(diff.sentState).toEqual([{ lineId: "tea", sentQuantity: quantity(2), sentNote: null }]);
  });

  it("splits one order between the bar and the kitchen, in the order stations first appear", () => {
    const diff = send(
      order([dish("cake", 1), dish("tea", 1), dish("noodle", 3), dish("coffee", 1)]),
      [],
    );
    expect(summary(diff)).toEqual([
      { station: "kitchen", lines: ["new cake 1000", "new noodle 3000"] },
      { station: "bar", lines: ["new tea 1000", "new coffee 1000"] },
    ]);
  });

  it("prints nothing, and records nothing, for an item no station makes", () => {
    const diff = send(order([dish("water", 2)]), []);
    expect(diff.tickets).toEqual([]);
    expect(diff.sentState).toEqual([]);
  });
});

describe("kitchen tickets for later rounds", () => {
  it("prints only the items and the units added since the last ticket", () => {
    const first = order([dish("tea", 1), dish("cake", 1)]);
    const sent = send(first, []).sentState;
    const second = withLines(editLine(first, "tea", { quantity: quantity(3) }), [
      ...editLine(first, "tea", { quantity: quantity(3) }).lines,
      dish("noodle", 1),
    ]);
    expect(summary(send(second, sent))).toEqual([
      { station: "bar", lines: ["new tea 2000"] },
      { station: "kitchen", lines: ["new noodle 1000"] },
    ]);
  });

  it("prints a cancel for sent units on the station that has them, with its toppings", () => {
    const first = order([dish("tea", 2), topping("pearl", "tea"), dish("cake", 1)]);
    const sent = send(first, []).sentState;
    const { order: after, record } = cancel(first, sent, "tea", 1);
    const diff = send(after, sent);
    expect(summary(diff)).toEqual([
      { station: "bar", lines: [`cancel ${record.reversalLineId} 1000`] },
    ]);
    const printed = diff.tickets[0]?.lines[0];
    expect(printed?.cancelsLineId).toBe("tea");
    expect(printed?.children.map((c) => c.name)).toEqual(["topping pearl"]);
    expect(sentOf(diff.sentState, record.reversalLineId ?? "")).toBe(quantity(1));
  });

  it("routes a cancel by the line it cancels, wherever that line was routed", () => {
    const first = order([dish("tea", 2)]);
    const byLine = (l: { id: string }) => (l.id === "tea" ? "bar-upstairs" : null);
    const sent = diffKitchenTicket(first, [], byLine).sentState;
    const { order: after } = cancel(first, sent, "tea", 1);
    const diff = diffKitchenTicket(after, sent, byLine);
    expect(diff.tickets.map((t) => [t.stationId, t.lines.map((l) => l.kind)])).toEqual([
      ["bar-upstairs", ["cancel"]],
    ]);
  });

  it("keeps what a station was sent when its item stops being routed anywhere", () => {
    const first = order([dish("tea", 2)]);
    const sent = send(first, []).sentState;
    const diff = diffKitchenTicket(first, sent, () => null);
    expect(diff.tickets).toEqual([]);
    expect(diff.sentState).toEqual(sent);
  });

  it("prints no cancel for units the station never saw", () => {
    const first = order([dish("tea", 1)]);
    const sent = send(first, []).sentState;
    const more = editLine(first, "tea", { quantity: quantity(3) });
    const { order: after } = cancel(more, sent, "tea", 2);
    expect(after.lines.some((l) => l.reversesLineId !== null)).toBe(false);
    expect(send(after, sent).tickets).toEqual([]);
  });

  it("sends a changed note for the units the station still has to make", () => {
    const first = order([dish("tea", 3, "less ice")]);
    const sent = send(first, []).sentState;
    const { order: cancelled } = cancel(first, sent, "tea", 1);
    const afterCancel = send(cancelled, sent).sentState;
    const renoted = editLine(cancelled, "tea", { note: "no ice", quantity: quantity(4) });
    const diff = send(renoted, afterCancel);
    expect(summary(diff)).toEqual([
      { station: "bar", lines: ["new tea 1000", "note_changed tea 2000"] },
    ]);
    const [fresh, changed] = diff.tickets[0]?.lines ?? [];
    expect([fresh?.note, changed?.note, changed?.previousNote]).toEqual([
      "no ice",
      "no ice",
      "less ice",
    ]);
    expect(diff.sentState.find((s) => s.lineId === "tea")?.sentNote).toBe("no ice");
  });

  it("prints the same changes again when the last print was not recorded", () => {
    const first = order([dish("tea", 1), dish("cake", 2)]);
    expect(send(first, [])).toEqual(send(first, []));
    const sent = send(first, []).sentState;
    const { order: after } = cancel(first, sent, "cake", 1);
    expect(summary(send(after, sent))).toEqual(summary(send(after, sent)));
    expect(send(after, send(after, sent).sentState).tickets).toEqual([]);
  });
});
