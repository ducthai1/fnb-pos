import { describe, expect, it } from "vitest";
import { outcomeOf } from "../../zod-issue-test-helpers";
import { saveDraftPayloadSchema } from "./save-draft-payload-schema";

const id = (n: number) => `0192f5a4-7c3e-7d10-8b2a-${String(n).padStart(12, "0")}`;
const draft = {
  orderId: id(1),
  deviceOrderNo: 7,
  serviceType: "takeaway",
  channelKey: null,
  lines: [],
};

describe("the version a draft was edited from", () => {
  it("is carried when given, 0 for an order the till opens now, and absent for older tills", () => {
    expect(saveDraftPayloadSchema.parse({ ...draft, expectedVersion: 4 }).expectedVersion).toBe(4);
    expect(saveDraftPayloadSchema.parse({ ...draft, expectedVersion: 0 }).expectedVersion).toBe(0);
    expect("expectedVersion" in saveDraftPayloadSchema.parse(draft)).toBe(false);
  });

  it.each([
    ["below zero", -1],
    ["in fractions", 1.5],
    ["past an exact JSON number", 2 ** 53],
    ["as text", "4"],
    ["null", null],
  ])("is refused %s", (_case, expectedVersion) => {
    expect(outcomeOf(saveDraftPayloadSchema, { ...draft, expectedVersion }).ok).toBe(false);
  });
});
