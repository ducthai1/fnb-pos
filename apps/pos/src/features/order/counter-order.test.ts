import { saveDraftPayloadSchema } from "@fnb/contracts";
import { describe, expect, it } from "vitest";
import { HOSTILE_ORDER } from "../../test-support/hostile-order";
import { MENU } from "../../test-support/till-fixtures";
import {
  type CounterOrder,
  MAX_LINE_QUANTITY,
  cleanNote,
  newCounterOrder,
  removeCartLine,
  setLineQuantity,
  setServiceType,
} from "./counter-order";
import { draftPayload } from "./save-draft-command";
import { InvalidPayloadError, tillCommand } from "./till-command";

const line = {
  lineId: "0199f000-0000-7000-8000-00000000bbb1",
  productId: MENU.coffee,
  variantId: null,
  modifiers: [],
  quantity: 1,
  note: null,
};
const order: CounterOrder = {
  ...newCounterOrder("0199f000-0000-7000-8000-00000000bbbb", 1),
  lines: [line],
};
const PLACE = { deviceId: "d", branchId: "b", utcOffsetMinutes: 420, businessDayStartMinute: 240 };

describe("changing the counter order", () => {
  it("sets a quantity from 1 up to the limit and ignores anything outside it", () => {
    expect(setLineQuantity(order, line.lineId, 2).lines[0]?.quantity).toBe(2);
    expect(setLineQuantity(order, line.lineId, MAX_LINE_QUANTITY).lines[0]?.quantity).toBe(999);
    for (const refused of [0, -1, 1.5, MAX_LINE_QUANTITY + 1]) {
      expect(setLineQuantity(order, line.lineId, refused)).toBe(order);
    }
  });

  it("removes a line that was never sent", () => {
    expect(removeCartLine(order, line.lineId).lines).toEqual([]);
  });

  it("carries a table number for dine-in only, trimmed to what the contract takes", () => {
    expect(setServiceType(order, "dine_in", "  5 ")).toMatchObject({
      serviceType: "dine_in",
      tableTag: "5",
    });
    expect(setServiceType(order, "dine_in", "")).toMatchObject({ tableTag: null });
    expect(setServiceType(order, "takeaway", "5")).toMatchObject({
      serviceType: "takeaway",
      tableTag: null,
    });
    expect(setServiceType(order, "dine_in", "x".repeat(30)).tableTag).toHaveLength(20);
  });

  it("keeps a note's lines, drops surrounding blanks, and stores no empty note", () => {
    expect(cleanNote("  ít đá\nkhông đường \n")).toBe("ít đá\nkhông đường");
    expect(cleanNote(" \n ")).toBeNull();
    expect(cleanNote("a".repeat(600))).toHaveLength(500);
  });
});

describe("the draft the till sends", () => {
  it("carries intent only, in the contract's shape, even for the hostile order", () => {
    const payload = draftPayload(HOSTILE_ORDER);
    expect(saveDraftPayloadSchema.safeParse(payload).success).toBe(true);
    expect(payload.lines[0]).toEqual({
      lineId: HOSTILE_ORDER.lines[0]?.lineId,
      productId: HOSTILE_ORDER.lines[0]?.productId,
      variantId: MENU.sizeL,
      modifiers: HOSTILE_ORDER.lines[0]?.modifiers,
      quantity: "999",
      note: HOSTILE_ORDER.lines[0]?.note,
    });
    expect(JSON.stringify(payload)).not.toMatch(/price|amount/i);
  });

  it("never records a command whose payload breaks its contract", () => {
    const bad = { ...draftPayload(order), tableTag: "x".repeat(21), serviceType: "dine_in" };
    const target = {
      entity: "order",
      entityId: order.orderId,
      optimistic: { id: order.orderId, version: 1 },
    };
    expect(() =>
      tillCommand(PLACE, "order.save_draft", saveDraftPayloadSchema, bad, Date.now(), target),
    ).toThrow(InvalidPayloadError);
    const good = tillCommand(
      PLACE,
      "order.save_draft",
      saveDraftPayloadSchema,
      { ...draftPayload(order) },
      Date.UTC(2026, 9, 19, 20, 0),
      target,
    );
    // 03:00 in Vietnam is before the 04:00 day start: still the 19th's business day.
    expect(good.businessDate).toBe("2026-10-19");
  });
});
