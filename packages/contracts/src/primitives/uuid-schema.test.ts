import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { outcomeOf } from "../zod-issue-test-helpers";
import { uuidSchema } from "./uuid-schema";

const ID = "0192f5a4-7c3e-7d10-8b2a-3f9e1c4d5a6b";

describe("uuidSchema", () => {
  it("accepts an id in the lowercase 8-4-4-4-12 form it is generated in", () => {
    expect(uuidSchema.parse(ID)).toBe(ID);
    fc.assert(
      fc.property(fc.uuid(), (id) => {
        expect(uuidSchema.parse(id)).toBe(id);
      }),
    );
  });

  it.each([
    ["uppercase", ID.toUpperCase()],
    ["one uppercase letter", ID.replace("f", "F")],
    ["no hyphens", ID.replaceAll("-", "")],
    ["braces", `{${ID}}`],
    ["a trailing newline", `${ID}\n`],
    ["a group too long", `${ID}0`],
    ["a letter beyond f", ID.replace("a", "g")],
  ])("refuses an id with %s", (_label, wire) => {
    expect(outcomeOf(uuidSchema, wire)).toEqual({
      ok: false,
      issues: [expect.objectContaining({ code: "invalid_string" })],
    });
  });

  it("refuses an id that is not a string", () => {
    expect(outcomeOf(uuidSchema, 42).ok).toBe(false);
  });
});
