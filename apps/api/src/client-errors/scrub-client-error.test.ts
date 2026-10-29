import { describe, expect, it } from "vitest";
import { scrubClientError, scrubText, stripQueryAndFragment } from "./scrub-client-error";

const base = {
  app: "pos",
  appVersion: "0.1.0+abc1234",
  occurredAt: "2026-10-29T10:00:00.000Z",
  kind: "error",
} as const;

describe("scrubbing what a client reports", () => {
  it("cuts the query string and the fragment off a route and off URLs in text", () => {
    expect(stripQueryAndFragment("/orders/7?phone=0912345678#top")).toBe("/orders/7");
    const text = "failed to fetch https://shop.vn/api/orders?customer=An#x and /pos/tables?q=1";
    expect(scrubText(text)).toBe("failed to fetch https://shop.vn/api/orders and /pos/tables");
  });

  it("redacts emails, phone numbers, long digit runs and tokens", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJl";
    const text = [
      "mail an.nguyen@example.vn",
      "call +84 912 345 678 or 0912.345.678",
      "card 4111111111111111",
      `jwt ${jwt}`,
      "Authorization: Bearer abcdef1234567890abcdef",
    ].join(" | ");
    const scrubbed = scrubText(text);
    for (const secret of [
      "an.nguyen",
      "912 345",
      "0912.345",
      "4111111111",
      jwt,
      "abcdef1234567890",
    ]) {
      expect(scrubbed).not.toContain(secret);
    }
    expect(scrubbed).toContain("[email]");
    expect(scrubbed).toContain("[token]");
  });

  it("keeps short numbers such as line and column positions", () => {
    expect(scrubText("at render (app.js:1204:35) total 45000")).toBe(
      "at render (app.js:1204:35) total 45000",
    );
  });

  it("caps the message at 500 characters and the stack at 4 KB of bytes", () => {
    const kept = scrubClientError({
      ...base,
      message: "x".repeat(2_000),
      stack: "đ".repeat(5_000),
    });
    expect(kept.message).toHaveLength(500);
    expect(Buffer.byteLength(kept.stack ?? "", "utf8")).toBeLessThanOrEqual(4096);
    expect(kept.stack).not.toContain("�");
  });

  it("keeps no route or stack when none was sent", () => {
    expect(scrubClientError({ ...base, message: "m" })).toMatchObject({ stack: null, route: null });
  });
});
