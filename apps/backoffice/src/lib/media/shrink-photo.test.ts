import { describe, expect, it } from "vitest";
import { shrunkSize } from "./shrink-photo";

describe("the size a photo is sent at", () => {
  it("brings the long side down to 800px, keeping the shape", () => {
    expect(shrunkSize(4032, 3024)).toEqual({ width: 800, height: 600 });
    expect(shrunkSize(1080, 1920)).toEqual({ width: 450, height: 800 });
    expect(shrunkSize(6000, 60)).toEqual({ width: 800, height: 8 });
  });

  it("never enlarges a photo already small, and never draws a side of zero", () => {
    expect(shrunkSize(640, 480)).toEqual({ width: 640, height: 480 });
    expect(shrunkSize(20000, 10)).toEqual({ width: 800, height: 1 });
  });
});
