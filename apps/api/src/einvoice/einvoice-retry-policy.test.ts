import { describe, expect, it } from "vitest";
import { DEFAULT_EINVOICE_RETRY_POLICY as POLICY, retryDelayMs } from "./einvoice-retry-policy";

describe("retryDelayMs", () => {
  it("doubles from the first delay: 30 s, 1 min, 2 min, 4 min", () => {
    expect([1, 2, 3, 4].map((n) => retryDelayMs(POLICY, n))).toEqual([
      30_000, 60_000, 120_000, 240_000,
    ]);
  });

  it("stops growing at the ceiling, however many attempts failed", () => {
    expect(retryDelayMs(POLICY, 8)).toBe(3_600_000);
    expect(retryDelayMs(POLICY, 1_000)).toBe(3_600_000);
  });

  it("never waits less after more failures, and never past the ceiling", () => {
    const delays = Array.from({ length: 200 }, (_, i) => retryDelayMs(POLICY, i + 1));
    delays.forEach((delay, i) => {
      expect(delay).toBeGreaterThanOrEqual(i === 0 ? POLICY.firstDelayMs : (delays[i - 1] ?? 0));
      expect(delay).toBeLessThanOrEqual(POLICY.maxDelayMs);
    });
  });
});
