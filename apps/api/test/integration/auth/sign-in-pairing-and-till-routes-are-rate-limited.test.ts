import { newId } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { type RateLimitSettings, installRateLimits } from "../../../src/http/rate-limit-hooks";
import { PASSWORD, createAccount, uniqueEmail } from "../support/backoffice-accounts";
import { ManualClock } from "../support/manual-clock";
import { pairDevice } from "../support/paired-devices";
import { type StaffedShop, staffedShop } from "../support/staffed-shop";

const info = inject("testPostgres");
const WINDOW = 60_000;
const SHOP_ADDRESS = "203.0.113.10";
const OTHER_ADDRESS = "203.0.113.20";

const LIMITS: RateLimitSettings = {
  windowMillis: WINDOW,
  loginPerAddress: 4,
  loginPerAccount: 2,
  pairingPerAddress: 2,
  tillPerAddress: 4,
  tillPerDevice: 2,
  trustedProxies: [],
};

let pool: pg.Pool;
let shop: StaffedShop;
let secondTill: string;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app"), max: 4 });
  const setup = buildApp({ pool });
  shop = await staffedShop(setup, pool);
  secondTill = (await pairDevice(setup, shop.managerCookie, shop.branchId, "Quầy 2")).deviceToken;
  await setup.close();
});

afterAll(() => pool.end());

function limitedApp(clock: ManualClock, limits: Partial<RateLimitSettings> = {}): FastifyInstance {
  const app = buildApp({ pool, clock });
  installRateLimits(app, { ...LIMITS, ...limits }, clock);
  return app;
}

const login = (app: FastifyInstance, email: string, address = SHOP_ADDRESS) =>
  app.inject({
    method: "POST",
    url: "/auth/login",
    remoteAddress: address,
    payload: { email, password: "not the password" },
  });

const openStaffSession = (app: FastifyInstance, deviceToken: string, address = SHOP_ADDRESS) =>
  app.inject({
    method: "POST",
    url: "/pos/staff-sessions",
    remoteAddress: address,
    headers: { authorization: `Device ${deviceToken}` },
    payload: { staffId: newId(), pin: "1357" },
  });

const statuses = (responses: LightMyRequestResponse[]) => responses.map((r) => r.statusCode);

function expectRateLimited(response: LightMyRequestResponse, retryAfterSeconds: number) {
  expect(response.statusCode).toBe(429);
  expect(response.json()).toEqual({ code: "API_RATE_LIMITED" });
  expect(response.headers["retry-after"]).toBe(String(retryAfterSeconds));
}

describe("sign-in", () => {
  it("lets an account try up to its limit, then answers 429 until the window ends", async () => {
    const clock = new ManualClock();
    const app = limitedApp(clock);
    const email = uniqueEmail("limited");
    await createAccount(pool, { email });
    expect(statuses([await login(app, email), await login(app, email)])).toEqual([401, 401]);
    clock.advance(15_000);
    expectRateLimited(await login(app, email), 45);
    clock.advance(45_000);
    expect((await login(app, email)).statusCode).toBe(401);
    await app.close();
  });

  it("counts the account however it is typed, so case and spaces do not reset it", async () => {
    const app = limitedApp(new ManualClock());
    const email = uniqueEmail("typed");
    await login(app, email);
    await login(app, `  ${email.toUpperCase()} `);
    expect((await login(app, email)).statusCode).toBe(429);
    await app.close();
  });

  it("limits one address across accounts, and leaves other addresses alone", async () => {
    const app = limitedApp(new ManualClock());
    const tries = await Promise.all(
      [1, 2, 3, 4].map(() => login(app, uniqueEmail("spray"), SHOP_ADDRESS)),
    );
    expect(statuses(tries)).toEqual([401, 401, 401, 401]);
    expect((await login(app, uniqueEmail("spray"), SHOP_ADDRESS)).statusCode).toBe(429);
    expect((await login(app, uniqueEmail("spray"), OTHER_ADDRESS)).statusCode).toBe(401);
    await app.close();
  });

  it("still signs the right password in while under the limit", async () => {
    const app = limitedApp(new ManualClock());
    const email = uniqueEmail("right");
    await createAccount(pool, { email });
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      remoteAddress: SHOP_ADDRESS,
      payload: { email, password: PASSWORD },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ code: "API_AUTH_NO_ACTIVE_MEMBERSHIP" });
    await app.close();
  });
});

describe("pairing", () => {
  it("limits guesses of a code per address", async () => {
    const app = limitedApp(new ManualClock());
    const guess = (address: string) =>
      app.inject({
        method: "POST",
        url: "/devices/pair",
        remoteAddress: address,
        payload: { code: "ABCD-EFGH", deviceName: "Quầy lạ" },
      });
    expect(statuses([await guess(SHOP_ADDRESS), await guess(SHOP_ADDRESS)])).toEqual([401, 401]);
    expectRateLimited(await guess(SHOP_ADDRESS), 60);
    expect((await guess(OTHER_ADDRESS)).statusCode).toBe(401);
    await app.close();
  });
});

describe("the till's PIN and approval routes", () => {
  it("limit each till on its own, so one busy till does not hold up its neighbour", async () => {
    const app = limitedApp(new ManualClock(), { tillPerAddress: 100 });
    const first = [await openStaffSession(app, shop.deviceToken)];
    first.push(await openStaffSession(app, shop.deviceToken));
    expect(statuses(first)).toEqual([404, 404]);
    expect((await openStaffSession(app, shop.deviceToken)).statusCode).toBe(429);
    expect((await openStaffSession(app, secondTill)).statusCode).toBe(404);
    await app.close();
  });

  it("limit the shop's address across its tills", async () => {
    const app = limitedApp(new ManualClock(), { tillPerDevice: 100 });
    for (const token of [shop.deviceToken, secondTill, shop.deviceToken, secondTill]) {
      expect((await openStaffSession(app, token)).statusCode).toBe(404);
    }
    expect((await openStaffSession(app, secondTill)).statusCode).toBe(429);
    await app.close();
  });

  it("count approvals apart from PIN sign-ins", async () => {
    const app = limitedApp(new ManualClock());
    const approve = () =>
      app.inject({
        method: "POST",
        url: "/pos/approvals",
        remoteAddress: SHOP_ADDRESS,
        headers: { authorization: `Device ${shop.deviceToken}` },
        payload: { action: { key: "void_line" }, approverStaffId: newId(), approverPin: "2468" },
      });
    await openStaffSession(app, shop.deviceToken);
    await openStaffSession(app, shop.deviceToken);
    expect((await approve()).statusCode).not.toBe(429);
    expect((await approve()).statusCode).not.toBe(429);
    expect((await approve()).statusCode).toBe(429);
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

describe("behind a proxy", () => {
  it("counts each client the trusted proxy names apart", async () => {
    const app = limitedApp(new ManualClock(), { trustedProxies: ["127.0.0.1"] });
    const viaProxy = (client: string) =>
      app.inject({
        method: "POST",
        url: "/devices/pair",
        remoteAddress: "127.0.0.1",
        headers: { "x-forwarded-for": client },
        payload: { code: "ABCD-EFGH", deviceName: "Quầy lạ" },
      });
    await viaProxy(SHOP_ADDRESS);
    await viaProxy(SHOP_ADDRESS);
    expect((await viaProxy(SHOP_ADDRESS)).statusCode).toBe(429);
    expect((await viaProxy(OTHER_ADDRESS)).statusCode).toBe(401);
    await app.close();
  });

  it("ignores the header from a peer that is not the proxy", async () => {
    const app = limitedApp(new ManualClock(), { trustedProxies: ["127.0.0.1"] });
    const spoofed = (claimed: string) =>
      app.inject({
        method: "POST",
        url: "/devices/pair",
        remoteAddress: SHOP_ADDRESS,
        headers: { "x-forwarded-for": claimed },
        payload: { code: "ABCD-EFGH", deviceName: "Quầy lạ" },
      });
    await spoofed("192.0.2.1");
    await spoofed("192.0.2.2");
    expect((await spoofed("192.0.2.3")).statusCode).toBe(429);
    await app.close();
  });
});
