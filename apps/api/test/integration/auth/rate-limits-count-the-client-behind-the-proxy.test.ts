import { newId } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { RateLimitSettings } from "../../../src/http/rate-limit-hooks";
import { ManualClock } from "../support/manual-clock";
import {
  OTHER_ADDRESS,
  SHOP_ADDRESS,
  guessPairingCode,
  limitedApp as limitedAppOn,
  statuses,
} from "../support/rate-limited-app";

// Which client a request is counted for: the one the proxy saw, by its IPv6 network, and
// only on the routes that are limited.
const info = inject("testPostgres");
let pool: pg.Pool;

beforeAll(() => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app"), max: 4 });
});

afterAll(() => pool.end());

const limitedApp = (clock: ManualClock, limits: Partial<RateLimitSettings> = {}) =>
  limitedAppOn(pool, clock, limits);

describe("IPv6 clients", () => {
  it("are counted by their /64, so a new address in it does not reset the count", async () => {
    const app = limitedApp(new ManualClock());
    const guess = (address: string) => guessPairingCode(app, address);
    await guess("2001:db8:aa:bb::1");
    await guess("2001:db8:aa:bb::2");
    expect((await guess("2001:db8:aa:bb:ffff::3")).statusCode).toBe(429);
    expect((await guess("2001:db8:aa:bc::1")).statusCode).toBe(401);
    await app.close();
  });
});

describe("behind a proxy", () => {
  it("counts each client the trusted proxy names apart", async () => {
    const app = limitedApp(new ManualClock(), { trustedProxies: ["127.0.0.1"] });
    const viaProxy = (client: string) =>
      guessPairingCode(app, "127.0.0.1", { "x-forwarded-for": client });
    await viaProxy(SHOP_ADDRESS);
    await viaProxy(SHOP_ADDRESS);
    expect((await viaProxy(SHOP_ADDRESS)).statusCode).toBe(429);
    expect((await viaProxy(OTHER_ADDRESS)).statusCode).toBe(401);
    await app.close();
  });

  it("ignores the header from a peer that is not the proxy", async () => {
    const app = limitedApp(new ManualClock(), { trustedProxies: ["127.0.0.1"] });
    const spoofed = (claimed: string) =>
      guessPairingCode(app, SHOP_ADDRESS, { "x-forwarded-for": claimed });
    await spoofed("192.0.2.1");
    await spoofed("192.0.2.2");
    expect((await spoofed("192.0.2.3")).statusCode).toBe(429);
    await app.close();
  });
});

describe("what is not limited", () => {
  it("never refuses a payment notice or any other route, however many arrive", async () => {
    const app = limitedApp(new ManualClock(), { pairingPerAddress: 1, tillPerAddress: 1 });
    const notices = await Promise.all(
      Array.from({ length: 6 }, () =>
        app.inject({
          method: "POST",
          url: `/webhooks/payments/sepay/${newId()}`,
          remoteAddress: SHOP_ADDRESS,
          payload: { id: 1 },
        }),
      ),
    );
    expect(statuses(notices)).not.toContain(429);
    const health = await Promise.all(
      [1, 2, 3].map(() =>
        app.inject({ method: "GET", url: "/health", remoteAddress: SHOP_ADDRESS }),
      ),
    );
    expect(statuses(health)).toEqual([200, 200, 200]);
    await app.close();
  });
});
