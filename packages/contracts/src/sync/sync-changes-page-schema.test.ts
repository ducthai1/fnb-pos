import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { outcomeOf, refusedPathsOf } from "../zod-issue-test-helpers";
import { changeSeqSchema, syncChangesPageSchema } from "./sync-changes-page-schema";

const change = (changeSeq: string, snapshot: Record<string, unknown> | null = { name: "Bar" }) => ({
  changeSeq,
  entity: "station",
  entityId: "0192f5a4-7c3e-7d10-8b2a-3f9e1c4d5a6b",
  snapshot,
});

describe("syncChangesPageSchema", () => {
  it("accepts a page in changeSeq order, a deletion included, and an empty page", () => {
    const page = {
      changes: [change("7"), change("12", null), change("9007199254740993")],
      nextCursor: "9007199254740993",
    };
    expect(syncChangesPageSchema.parse(page)).toEqual(page);
    expect(syncChangesPageSchema.parse({ changes: [], nextCursor: "0" }).changes).toEqual([]);
  });

  it.each([
    ["a repeated change", ["7", "7"]],
    ["a change older than the one before", ["12", "7"]],
    ["changes ordered as text rather than as numbers", ["10", "9"]],
  ])("refuses a page with %s", (_label, seqs) => {
    const page = { changes: seqs.map((seq) => change(seq)), nextCursor: "12" };
    expect(refusedPathsOf(syncChangesPageSchema, page)).toEqual(["changes"]);
  });

  it("orders by number, so 10 after 9 is in order", () => {
    expect(
      outcomeOf(syncChangesPageSchema, { changes: [change("9"), change("10")], nextCursor: "10" })
        .ok,
    ).toBe(true);
  });

  it.each([
    ["changes.0.changeSeq", { changeSeq: 7 }],
    ["changes.0.entity", { entity: "Product" }],
    ["changes.0.entityId", { entityId: "not-a-uuid" }],
    ["changes.0.snapshot", { snapshot: "row" }],
  ])("refuses a change whose field at %s is malformed", (path, broken) => {
    const page = { changes: [{ ...change("7"), ...broken }], nextCursor: "7" };
    expect(refusedPathsOf(syncChangesPageSchema, page)).toEqual([path]);
  });

  it("refuses a page without a cursor to resume from", () => {
    expect(refusedPathsOf(syncChangesPageSchema, { changes: [], nextCursor: "" })).toEqual([
      "nextCursor",
    ]);
    expect(refusedPathsOf(syncChangesPageSchema, { changes: [] })).toEqual(["nextCursor"]);
  });
});

describe("changeSeqSchema", () => {
  it.each(["0", "-1", "07", "1.0", "1e3", " 1", "abc", ""])("refuses %j", (seq) => {
    expect(outcomeOf(changeSeqSchema, seq).ok).toBe(false);
  });

  it("refuses a number sent as a JSON number, which loses digits past 2^53", () => {
    expect(outcomeOf(changeSeqSchema, 7).ok).toBe(false);
  });

  it("accepts every Postgres bigint from 1 and nothing beyond", () => {
    const max = 2n ** 63n - 1n;
    expect(changeSeqSchema.parse(max.toString())).toBe(max.toString());
    expect(outcomeOf(changeSeqSchema, (max + 1n).toString()).ok).toBe(false);
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max }), (seq) => {
        expect(changeSeqSchema.parse(seq.toString())).toBe(seq.toString());
      }),
      { numRuns: 2_000 },
    );
  });
});
