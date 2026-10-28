import { describe, expect, it } from "vitest";
import { formatBusinessDate } from "./format-business-date";

describe("a business date as Vietnamese readers write it", () => {
  it("reads day/month/year, zero-padded", () => {
    expect(formatBusinessDate("2026-10-21")).toBe("21/10/2026");
    expect(formatBusinessDate("2027-01-05")).toBe("05/01/2027");
  });

  it("leaves text that is no real calendar day as it came", () => {
    for (const text of ["2026-02-30", "21/10/2026", "2026-1-5", "", "hôm nay"]) {
      expect(formatBusinessDate(text)).toBe(text);
    }
  });
});
