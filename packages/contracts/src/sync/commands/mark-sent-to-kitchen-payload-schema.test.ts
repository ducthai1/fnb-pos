import { describe, expect, it } from "vitest";
import { domainCodesOf, outcomeOf, refusedPathsOf } from "../../zod-issue-test-helpers";
import { markSentToKitchenPayloadSchema } from "./mark-sent-to-kitchen-payload-schema";

const id = (n: number) => `0192f5a4-7c3e-7d10-8b2a-${String(n).padStart(12, "0")}`;
const line = (n: number, kind = "new", quantity = "2") => ({
  lineId: id(n),
  kind,
  quantity,
  note: null,
});
const ticket = (lines: object[], more: object[] = []) => ({
  orderId: id(1),
  ticketId: id(2),
  stations: [{ stationId: id(3), lines }, ...more],
});

describe("markSentToKitchenPayloadSchema", () => {
  it("reads each line's units as the domain's thousandths", () => {
    const parsed = markSentToKitchenPayloadSchema.parse(ticket([line(4, "new", "1.5")]));
    expect(parsed.stations[0]?.lines[0]?.quantity).toBe(1_500n);
  });

  it("takes every kind, and one line under two kinds", () => {
    const sent = ticket([line(4, "new"), line(4, "note_changed"), line(5, "cancel")]);
    expect(outcomeOf(markSentToKitchenPayloadSchema, sent).ok).toBe(true);
  });

  it.each([
    ["no unit at all", [line(4, "new", "0")]],
    ["a negative number of units", [line(4, "new", "-1")]],
    ["a kind the stations do not know", [line(4, "rush")]],
    ["no line for the station", []],
  ])("refuses %s", (_label, lines) => {
    expect(outcomeOf(markSentToKitchenPayloadSchema, ticket(lines)).ok).toBe(false);
  });

  it("refuses a ticket with no station", () => {
    const sent = { orderId: id(1), ticketId: id(2), stations: [] };
    expect(refusedPathsOf(markSentToKitchenPayloadSchema, sent)).toEqual(["stations"]);
  });

  it("refuses the same line twice under one kind, even at two stations", () => {
    const twice = ticket([line(4)], [{ stationId: id(6), lines: [line(4)] }]);
    expect(refusedPathsOf(markSentToKitchenPayloadSchema, twice)).toEqual(["stations.1.lines.0"]);
  });

  it("names the domain rule a quantity with four decimals breaks", () => {
    const sent = ticket([line(4, "new", "1.2345")]);
    expect(domainCodesOf(markSentToKitchenPayloadSchema, sent)).toEqual([
      "DOMAIN_MONEY_QUANTITY_TOO_PRECISE",
    ]);
  });
});
