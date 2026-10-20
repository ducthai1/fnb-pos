import { describe, expect, it } from "vitest";
import {
  DEFAULT_EINVOICE_RETRY_POLICY as POLICY,
  providerCallTimeoutMs,
  retryDelayMs,
} from "./einvoice-retry-policy";

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

describe("providerCallTimeoutMs", () => {
  it("gives a call up 20 s before a 2 minute lease ends", () => {
    expect(providerCallTimeoutMs(POLICY)).toBe(100_000);
  });

  it("keeps a quarter of a short lease clear, and always ends before the lease", () => {
    expect(providerCallTimeoutMs({ ...POLICY, leaseMs: 60_000 })).toBe(45_000);
    for (const leaseMs of [4, 1_000, 79_999, 80_000, 120_000, 600_000]) {
      const timeout = providerCallTimeoutMs({ ...POLICY, leaseMs });
      expect(timeout).toBeLessThan(leaseMs);
      expect(timeout).toBeGreaterThan(0);
    }
  });
});
