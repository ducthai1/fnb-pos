import { describe, expect, it } from "vitest";
import { nameMark } from "./name-mark";

describe("nameMark", () => {
  it("takes the first letter of the first two words, in capitals", () => {
    expect(nameMark("Cà phê sữa đá")).toBe("CP");
    expect(nameMark("  trà   đào ")).toBe("TĐ");
    expect(nameMark("Bạc")).toBe("B");
  });

  it("keeps a letter with its combining mark and an emoji whole", () => {
    const combined = `e${String.fromCodePoint(0x0301)}m`;
    expect(nameMark(`${combined} ơi`)).toBe(`E${String.fromCodePoint(0x0301)}Ơ`);
    expect(nameMark("🧋 Trà")).toBe("🧋T");
  });

  it("has no letters for a name of spaces", () => {
    expect(nameMark("   ")).toBe("");
  });
});
