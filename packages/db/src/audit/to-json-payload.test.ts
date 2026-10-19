import { describe, expect, it } from "vitest";
import { toJsonPayload } from "./to-json-payload";

describe("toJsonPayload", () => {
  it("writes bigint money as exact decimal strings, nested or not", () => {
    const text = toJsonPayload({ amount: 9_007_199_254_740_993n, lines: [{ total: -45_000n }] });
    expect(JSON.parse(text)).toEqual({
      amount: "9007199254740993",
      lines: [{ total: "-45000" }],
    });
  });

  it("leaves every other JSON value as it is", () => {
    const payload = { rate: 1_000, note: "ít đá 🧊", none: null, ok: true, list: [1, "a"] };
    expect(JSON.parse(toJsonPayload(payload))).toEqual(payload);
  });
});
