import { describe, expect, it } from "vitest";
import { pinProblem } from "./pin-rules";

const allPins = (length: number) =>
  Array.from({ length: 10 ** length }, (_, n) => String(n).padStart(length, "0"));

describe("pinProblem", () => {
  it.each(["4826", "73915", "602718", "0853", "1949", "2030"])("accepts %s", (pin) => {
    expect(pinProblem(pin)).toBeNull();
  });

  it.each([
    ["one digit repeated", ["0000", "77777", "999999"]],
    ["a block repeated", ["1212", "6969", "121212", "123123", "520520"]],
    ["a run up", ["0123", "1234", "45678", "123456", "456789"]],
    ["a run down", ["3210", "9876", "54321", "987654", "654321"]],
    ["a recent year", ["1950", "1990", "2000", "2029"]],
    ["a common keypad pick", ["2580", "0852", "1122", "147258", "159753", "789456"]],
  ])("refuses %s as too weak", (_rule, pins) => {
    for (const pin of pins)
      expect({ pin, problem: pinProblem(pin) }).toEqual({ pin, problem: "too-weak" });
  });

  it.each(["123", "1234567", "12a4", "12 34", "-123", "١٢٣٤", "４８２６", ""])(
    "refuses %j as not 4 to 6 digits",
    (pin) => {
      expect(pinProblem(pin)).toBe("format");
    },
  );

  // Every PIN of each length, so a rule that goes missing or widens changes a count.
  it.each([
    [4, 196],
    [5, 22],
    [6, 1107],
  ])("refuses exactly the expected number of %i-digit PINs", (length, refused) => {
    const weak = allPins(length).filter((pin) => pinProblem(pin) === "too-weak");
    expect(weak).toHaveLength(refused);
    expect(allPins(length).every((pin) => pinProblem(pin) !== "format")).toBe(true);
  });
});
