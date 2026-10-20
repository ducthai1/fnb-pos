import { describe, expect, it } from "vitest";
import { vi } from "../../messages/vi";
import { requestJson, resultOf, retryAfterOf } from "./api-result";
import { failureMessage } from "./failure-message";

const NOW = Date.UTC(2026, 9, 21, 4, 0, 0);
const turnedAway = (headers: Record<string, string>) => async () =>
  new Response(JSON.stringify({ code: "API_RATE_LIMITED" }), { status: 429, headers });

describe("a call the API turned away for coming too often", () => {
  it("says how many seconds to wait when the API named them", async () => {
    const answer = await requestJson(turnedAway({ "retry-after": "37" }), "/pos/staff-sessions", {
      method: "POST",
      body: {},
    });
    const failure = resultOf(answer, () => null);
    expect(failure).toMatchObject({ ok: false, status: 429, retryAfterSeconds: 37 });
    if (failure.ok) throw new Error("not a failure");
    expect(failureMessage(failure)).toBe(vi.errors.rateLimitedFor(37));
    expect(failureMessage(failure)).toContain("Thử lại sau 37 giây");
  });

  it("asks to wait a moment when the API named no time", async () => {
    const failure = resultOf(
      await requestJson(turnedAway({}), "/pos/approvals", { method: "POST" }),
      () => null,
    );
    if (failure.ok) throw new Error("not a failure");
    expect("retryAfterSeconds" in failure).toBe(false);
    expect(failureMessage(failure)).toBe(vi.errors.API_RATE_LIMITED);
  });

  it("reads Retry-After as seconds or as a date, and nothing else", () => {
    expect(retryAfterOf("120", NOW)).toBe(120);
    expect(retryAfterOf(new Date(NOW + 45_500).toUTCString(), NOW)).toBe(45);
    expect(retryAfterOf(new Date(NOW - 5_000).toUTCString(), NOW)).toBe(0);
    expect(retryAfterOf("soon", NOW)).toBeNull();
    expect(retryAfterOf(null, NOW)).toBeNull();
  });
});
