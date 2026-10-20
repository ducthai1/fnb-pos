import { describe, expect, it } from "vitest";
import { amountInputText, parseAmountText, parseCountText } from "./amount-text";

describe("amounts typed by a person", () => {
  it.each([
    ["35000", 35_000n],
    ["35.000", 35_000n],
    ["1,250,000", 1_250_000n],
    ["35 000", 35_000n],
    [" 0 ", 0n],
  ])("reads %j as whole đồng", (text, amount) => {
    expect(parseAmountText(text)).toBe(amount);
  });

  it.each(["", "35.5", "35.0000", "-5000", "3,5", "35k", "1e5", "9007199254740992"])(
    "refuses %j rather than guessing",
    (text) => {
      expect(parseAmountText(text)).toBeNull();
    },
  );

  it("writes an amount back the way it is typed", () => {
    expect(amountInputText(1_250_000)).toBe("1.250.000");
    expect(amountInputText(0)).toBe("0");
    expect(amountInputText(null)).toBe("");
  });

  it("reads limits as whole numbers only", () => {
    expect(parseCountText("5")).toBe(5);
    expect(parseCountText("0")).toBe(0);
    expect(parseCountText("1.5")).toBeNull();
    expect(parseCountText("-1")).toBeNull();
    expect(parseCountText("")).toBeNull();
  });
});
