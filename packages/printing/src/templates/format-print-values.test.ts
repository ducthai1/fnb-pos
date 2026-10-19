import { basisPoints, quantity, quantityFromThousandths, vnd } from "@fnb/domain";
import { describe, expect, it } from "vitest";
import { AT_1405 } from "../test-support/template-fixtures";
import {
  formatClock,
  formatQuantity,
  formatRate,
  formatSignedVnd,
  formatTimeOfDay,
} from "./format-print-values";

describe("values printed on slips", () => {
  it("writes the date day first and the time on a 24-hour clock", () => {
    expect(formatClock(AT_1405)).toBe("20/10/2026 14:05");
    expect(formatClock({ ...AT_1405, month: 1, day: 2, minuteOfDay: 0 })).toBe("02/01/2026 00:00");
    expect(formatTimeOfDay({ minuteOfDay: 1439 })).toBe("23:59");
  });

  it("writes quantities and rates with a decimal comma, and no decimals when whole", () => {
    expect(formatQuantity(quantity(2))).toBe("2");
    expect(formatQuantity(quantityFromThousandths(1250n))).toBe("1,25");
    expect(formatRate(basisPoints(800))).toBe("8%");
    expect(formatRate(basisPoints(1050))).toBe("10,5%");
    expect(formatRate(basisPoints(5))).toBe("0,05%");
    expect(formatRate(basisPoints(0))).toBe("0%");
  });

  it("signs a difference only when there is one", () => {
    expect(formatSignedVnd(vnd(50_000))).toBe("+50.000\u00a0₫");
    expect(formatSignedVnd(vnd(-50_000))).toBe("-50.000\u00a0₫");
    expect(formatSignedVnd(vnd(0))).toBe("0\u00a0₫");
  });
});
