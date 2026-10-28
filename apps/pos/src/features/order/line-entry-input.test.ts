import { describe, expect, it } from "vitest";
import { groupDigits, readEntry } from "./line-entry-input";

describe("reading what the cashier typed in the price or weight drawer", () => {
  it("reads whole đồng and whole grams from the digits, whatever else was typed", () => {
    expect(readEntry("price", "150.000")).toEqual({ ok: true, value: 150_000 });
    expect(readEntry("weight", "353")).toEqual({ ok: true, value: 353 });
    expect(readEntry("price", "007")).toEqual({ ok: true, value: 7 });
  });

  it("leaves nothing typed and a zero unconfirmable, without a reason to shout", () => {
    expect(readEntry("price", "")).toEqual({ ok: false, reason: "empty" });
    expect(readEntry("weight", "000")).toEqual({ ok: false, reason: "zero" });
  });

  it("refuses a price past 100.000.000 đ and a weight past 100 kg, and takes them at the cap", () => {
    expect(readEntry("price", "100000000")).toEqual({ ok: true, value: 100_000_000 });
    expect(readEntry("price", "100000001")).toEqual({ ok: false, reason: "too_high" });
    expect(readEntry("price", "99999999999")).toEqual({ ok: false, reason: "too_high" });
    expect(readEntry("weight", "100000")).toEqual({ ok: true, value: 100_000 });
    expect(readEntry("weight", "100001")).toEqual({ ok: false, reason: "too_heavy" });
  });

  it("groups the digits for the readout as the till writes money", () => {
    expect(groupDigits("1500000")).toBe("1.500.000");
    expect(groupDigits("150")).toBe("150");
    expect(groupDigits("")).toBe("");
  });
});
