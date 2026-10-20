import { expect } from "vitest";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import type pg from "pg";
import { buildApp } from "../../../src/build-app";
import { type RateLimitSettings, installRateLimits } from "../../../src/http/rate-limit-hooks";
import type { ManualClock } from "./manual-clock";

export const SHOP_ADDRESS = "203.0.113.10";
export const OTHER_ADDRESS = "203.0.113.20";

/** Small limits, so a test reaches each one in a few requests. */
export const TEST_LIMITS: RateLimitSettings = {
  windowMillis: 60_000,
  loginPerAddress: 4,
  loginPerAccount: 2,
  pairingPerAddress: 2,
  tillPerAddress: 4,
  tillPerDevice: 2,
  trustedProxies: [],
};

/** The app with the limits installed the way the server process installs them. */
export function limitedApp(
  pool: pg.Pool,
  clock: ManualClock,
  limits: Partial<RateLimitSettings> = {},
): FastifyInstance {
  const app = buildApp({ pool, clock });
  installRateLimits(app, { ...TEST_LIMITS, ...limits }, clock);
  return app;
}

/** A pairing attempt with a code that exists nowhere: 401 unless it is limited. */
export const guessPairingCode = (
  app: FastifyInstance,
  address: string,
  headers: Record<string, string> = {},
) =>
  app.inject({
    method: "POST",
    url: "/devices/pair",
    remoteAddress: address,
    headers,
    payload: { code: "ABCD-EFGH", deviceName: "Quầy lạ" },
  });

export const statuses = (responses: LightMyRequestResponse[]) =>
  responses.map((response) => response.statusCode);

export function expectRateLimited(response: LightMyRequestResponse, retryAfterSeconds: number) {
  expect(response.statusCode).toBe(429);
  expect(response.json()).toEqual({ code: "API_RATE_LIMITED" });
  expect(response.headers["retry-after"]).toBe(String(retryAfterSeconds));
}
