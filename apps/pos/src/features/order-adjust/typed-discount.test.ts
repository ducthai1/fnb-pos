import { basisPoints, vnd } from "@fnb/domain";
import { describe, expect, it } from "vitest";
import { typedDiscount } from "./typed-discount";

const percent = (rate: number) => ({ kind: "percent", rate: basisPoints(rate) });

describe("a typed discount", () => {
  it.each([
    ["12,5", 1250],
    ["12.5", 1250],
    [" 7 ", 700],
    ["0,01", 1],
    ["100", 10_000],
    ["100,00", 10_000],
  ])("reads %j as a percent in basis points", (text, rate) => {
    expect(typedDiscount("percent", text)).toEqual(percent(rate));
  });

  it.each(["0", "0,00", "100,01", "101", "1,234", "-5", "5%", "", "mười"])(
    "gives nothing for the percent %j, so a typo discounts nothing",
    (text) => {
      expect(typedDiscount("percent", text)).toBeNull();
    },
  );

  it("reads whole đồng with or without thousands dots, and refuses nothing or less", () => {
    expect(typedDiscount("amount", "20.000")).toEqual({ kind: "amount", amount: vnd(20_000n) });
    expect(typedDiscount("amount", "5000")).toEqual({ kind: "amount", amount: vnd(5_000n) });
    for (const text of ["0", "", "12,5", "-1000", "1e3"]) {
      expect(typedDiscount("amount", text)).toBeNull();
    }
  });
});
