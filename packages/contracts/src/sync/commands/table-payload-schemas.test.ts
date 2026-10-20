import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { outcomeOf, refusedPathsOf } from "../../zod-issue-test-helpers";
import { saveDraftPayloadSchema } from "./save-draft-payload-schema";
import {
  markPreBillPrintedPayloadSchema,
  transferTablePayloadSchema,
} from "./table-payload-schemas";

const id = (n: number) => `0192f5a4-7c3e-7d10-8b2a-${String(n).padStart(12, "0")}`;

const dineIn = {
  orderId: id(1),
  deviceOrderNo: 7,
  serviceType: "dine_in",
  channelKey: null,
  lines: [],
};

describe("a draft's table", () => {
  it("is none unless the till names one, for drafts of tills that never send it", () => {
    const parsed = saveDraftPayloadSchema.parse({ ...dineIn, serviceType: "takeaway" });
    expect({ tableId: parsed.tableId, tableTag: parsed.tableTag }).toEqual({
      tableId: null,
      tableTag: null,
    });
  });

  it("is either a table held or a table tag written on a counter order", () => {
    expect(saveDraftPayloadSchema.parse({ ...dineIn, tableId: id(5) }).tableId).toBe(id(5));
    expect(saveDraftPayloadSchema.parse({ ...dineIn, tableTag: " Sân 3 " }).tableTag).toBe("Sân 3");
  });

  it.each([
    ["both a table and a tag", { tableId: id(5), tableTag: "12" }, "tableTag"],
    ["a table on a takeaway", { tableId: id(5), serviceType: "takeaway" }, "serviceType"],
    ["a tag on a delivery", { tableTag: "12", serviceType: "delivery_self" }, "serviceType"],
    ["a blank tag", { tableTag: "  " }, "tableTag"],
    ["a tag past 20 characters", { tableTag: "1".repeat(21) }, "tableTag"],
    ["a table id that is not a uuid", { tableId: "B01" }, "tableId"],
  ])("refuses %s", (_label, change, path) => {
    expect(refusedPathsOf(saveDraftPayloadSchema, { ...dineIn, ...change })).toEqual([path]);
  });

  it("is accepted exactly when it is at most one of the two, and only on a dine-in order", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("dine_in", "takeaway", "delivery_self", "delivery_platform"),
        fc.option(fc.constant(id(5))),
        fc.option(fc.stringMatching(/^[0-9A-Za-z ]{0,3}[0-9A-Za-z]$/)),
        (serviceType, tableId, tableTag) => {
          const both = tableId !== null && tableTag !== null;
          const either = tableId !== null || tableTag !== null;
          const draft = { ...dineIn, serviceType, tableId, tableTag };
          expect(outcomeOf(saveDraftPayloadSchema, draft).ok).toBe(
            !both && (!either || serviceType === "dine_in"),
          );
        },
      ),
    );
  });
});

describe("table commands", () => {
  it("name the order, the target table and an optional approval", () => {
    const transfer = { orderId: id(1), toTableId: id(2) };
    expect(outcomeOf(transferTablePayloadSchema, transfer).ok).toBe(true);
    expect(outcomeOf(transferTablePayloadSchema, { ...transfer, approvalId: id(3) }).ok).toBe(true);
    expect(outcomeOf(markPreBillPrintedPayloadSchema, { orderId: id(1) }).ok).toBe(true);
  });

  it.each([
    [transferTablePayloadSchema, { orderId: id(1) }],
    [transferTablePayloadSchema, { orderId: id(1), toTableId: "B02" }],
    [markPreBillPrintedPayloadSchema, { orderId: "order-1" }],
  ])("refuse a missing or malformed id", (schema, payload) => {
    expect(outcomeOf(schema, payload).ok).toBe(false);
  });
});
