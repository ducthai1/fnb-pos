import { describe, expect, it } from "vitest";
import { initialOf, toneOf } from "./staff-avatar";

describe("the initial standing for a person on the till", () => {
  it("takes a Vietnamese letter whole with its marks, even when typed as separate marks", () => {
    expect(initialOf("ẩn")).toBe("Ẩ");
    // "a" + combining circumflex + combining hook above, as some keyboards send it.
    expect(initialOf(String.fromCodePoint(0x61, 0x302, 0x309, 0x6e))).toBe("Ẩ");
  });

  it("takes an emoji whole, not half of its surrogate pair", () => {
    expect(initialOf("🧋 Trà sữa")).toBe("🧋");
    expect(initialOf("👨‍👩‍👧 Nhà")).toBe("👨‍👩‍👧");
  });

  it("skips leading spaces and stands in a question mark for a blank name", () => {
    expect(initialOf("   lan")).toBe("L");
    expect(initialOf("   ")).toBe("?");
  });

  it("gives a person the same tone every time, and not everyone the same one", () => {
    expect(toneOf("0199f000-0000-7000-8000-0000000051a1")).toBe(
      toneOf("0199f000-0000-7000-8000-0000000051a1"),
    );
    const tones = new Set(["a", "b", "c", "d", "e", "f", "g", "h"].map(toneOf));
    expect(tones.size).toBeGreaterThan(1);
    for (const tone of tones) expect(tone).toBeGreaterThanOrEqual(0);
    for (const tone of tones) expect(tone).toBeLessThan(6);
  });
});
