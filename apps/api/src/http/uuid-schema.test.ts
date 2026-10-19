import { describe, expect, it } from "vitest";
import { UUID_REGEX, sameUuid } from "./uuid-schema";

const V7 = "01929c1e-5b3a-7c4d-8e9f-0a1b2c3d4e5f";
const V4 = "3f2b8c1a-9d4e-4f6a-b7c8-d9e0f1a2b3c4";

describe("UUID_REGEX", () => {
  it.each([V7, V4, "00000000-0000-0000-0000-000000000000"])("accepts %s", (id) => {
    expect(UUID_REGEX.test(id)).toBe(true);
  });

  it.each([
    ["a urn prefix", `urn:uuid:${V7}`],
    ["upper case", V7.toUpperCase()],
    ["one upper-case letter", V7.replace("c", "C")],
    ["braces", `{${V7}}`],
    ["no hyphens", V7.replaceAll("-", "")],
    ["a trailing character", `${V7}0`],
    ["a trailing newline", `${V7}\n`],
    ["surrounding spaces", ` ${V7} `],
    ["a group one digit short", "01929c1e-5b3a-7c4d-8e9f-0a1b2c3d4e5"],
    ["a non-hex digit", V7.replace("a", "g")],
    ["nothing", ""],
  ])("refuses %s", (_case, id) => {
    expect(UUID_REGEX.test(id)).toBe(false);
  });
});

describe("sameUuid", () => {
  it("matches an id however its letters are cased", () => {
    expect(sameUuid(V7, V7.toUpperCase())).toBe(true);
  });

  it("does not match two different ids", () => {
    expect(sameUuid(V7, V4)).toBe(false);
  });
});
