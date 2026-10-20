import { describe, expect, it } from "vitest";
import { MAX_TYPED_DIGITS, pressKey } from "./cash-keypad";

describe("pressKey", () => {
  it("adds the key's digits and takes the last one off", () => {
    expect(pressKey("", "5")).toBe("5");
    expect(pressKey("5", "000")).toBe("5000");
    expect(pressKey("5000", "back")).toBe("500");
    expect(pressKey("", "back")).toBe("");
  });

  it("drops leading zeros and reads a typed amount with dots", () => {
    expect(pressKey("", "0")).toBe("0");
    expect(pressKey("0", "7")).toBe("7");
    expect(pressKey("", "000")).toBe("0");
    expect(pressKey("100.000", "0")).toBe("1000000");
  });

  it("stops at the longest amount the till reads", () => {
    const longest = "9".repeat(MAX_TYPED_DIGITS);
    expect(pressKey(longest, "1")).toBe(longest);
    expect(pressKey("9".repeat(MAX_TYPED_DIGITS - 1), "000")).toBe(
      "9".repeat(MAX_TYPED_DIGITS - 1),
    );
  });
});
