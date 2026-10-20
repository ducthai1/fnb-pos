import { POS_FEED_ENTITY, settingsViewSchema } from "@fnb/contracts";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { FakeEInvoiceProvider } from "../../../src/einvoice/providers/fake-einvoice-provider";
import { EINVOICE_PROFILE } from "../support/einvoice-profiles";
import { changesOf, feedAfter } from "../support/menu-feed-probes";
import { secretKeysIn } from "../support/secret-keys";
import { type SyncShop, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool, einvoiceProviders: [new FakeEInvoiceProvider()] });
  s = await syncShop(app, pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

async function call(method: "GET" | "PUT" | "DELETE", url: string, value?: unknown) {
  const payload = value === undefined ? undefined : { value };
  const headers = { cookie: s.shop.managerCookie };
  const response = await app.inject({ method, url, headers, ...(payload ? { payload } : {}) });
  return { status: response.statusCode, body: response.json() };
}

const view = async (scope: string, id: string) =>
  settingsViewSchema.parse((await call("GET", `/settings?scope=${scope}&scopeId=${id}`)).body);
const entryOf = (shown: Awaited<ReturnType<typeof view>>, key: string) =>
  shown.entries.find((entry) => entry.key === key);

/** The settings copies till A pulls after `cursor`, for till A itself. */
async function tillAConfigAfter(cursor: string) {
  const { changes } = await feedAfter(app, s.tillA.deviceToken, cursor);
  return changesOf(changes, POS_FEED_ENTITY.deviceConfig, s.tillA.deviceId).map(
    (change) => change.snapshot as { settings: Record<string, unknown>; chargeProfile: unknown },
  );
}

describe("GET /settings", () => {
  it("shows a till every key as it resolves, the layers above it, and what it may set", async () => {
    const shown = await view("device", s.tillA.deviceId);
    expect(shown.scope).toEqual({ kind: "device", id: s.tillA.deviceId });
    expect(Object.keys(shown.layers)).toEqual(["system", "brand", "branch", "device"]);
    expect(entryOf(shown, "pay_first_counter")).toEqual({
      key: "pay_first_counter",
      kind: "flag",
      value: true,
      source: "system",
      editableHere: true,
      setHere: false,
    });
    expect(entryOf(shown, "tables")?.editableHere).toBe(false);
    expect(entryOf(shown, "shift_close_difference_tolerance")).toMatchObject({
      value: "0",
      kind: "setting",
    });
    expect(secretKeysIn(shown)).toEqual([]);
  });

  it("shows a brand only its own layer", async () => {
    const shown = await view("brand", s.brandId);
    expect(Object.keys(shown.layers)).toEqual(["system", "brand"]);
    expect(entryOf(shown, "happy_hour_pricing")?.editableHere).toBe(true);
  });
});

describe("PUT and DELETE /settings/:scope/:scopeId/:key", () => {
  it("sets a branch value the branch's tills pull, and clearing it gives them the default back", async () => {
    const { cursor } = await feedAfter(app, s.tillA.deviceToken);
    const url = `/settings/branch/${s.shop.branchId}/void_after_sent_needs_approval`;
    const set = await call("PUT", url, false);
    expect(set.status).toBe(200);
    expect(
      entryOf(settingsViewSchema.parse(set.body), "void_after_sent_needs_approval"),
    ).toMatchObject({
      value: false,
      source: "branch",
      setHere: true,
    });
    expect(
      entryOf(await view("device", s.tillA.deviceId), "void_after_sent_needs_approval"),
    ).toMatchObject({
      value: false,
      source: "branch",
      setHere: false,
    });
    const cleared = await call("DELETE", url);
    expect(
      entryOf(settingsViewSchema.parse(cleared.body), "void_after_sent_needs_approval"),
    ).toMatchObject({
      value: true,
      source: "system",
      setHere: false,
    });
    const pulled = (await tillAConfigAfter(cursor)).map(
      (copy) => copy.settings.void_after_sent_needs_approval,
    );
    expect(pulled).toEqual([false, true]);
  });

  it("stores a charge profile the tills then price with", async () => {
    const { cursor } = await feedAfter(app, s.tillA.deviceToken);
    const profile = {
      pricesIncludeTax: false,
      serviceCharge: { rate: 500, appliesTo: ["dine_in"], base: "after_discount", taxRate: 800 },
    };
    const set = await call("PUT", `/settings/branch/${s.shop.branchId}/charge_profile`, profile);
    expect(set.status).toBe(200);
    expect((await tillAConfigAfter(cursor)).map((copy) => copy.chargeProfile)).toEqual([profile]);
    await call("DELETE", `/settings/branch/${s.shop.branchId}/charge_profile`);
  });

  it("sets a till's own drawer tolerance as a decimal string", async () => {
    const url = `/settings/device/${s.tillB.deviceId}/shift_close_difference_tolerance`;
    expect((await call("PUT", url, "20000")).status).toBe(200);
    const atB = entryOf(await view("device", s.tillB.deviceId), "shift_close_difference_tolerance");
    expect(atB).toMatchObject({ value: "20000", source: "device" });
    expect(
      entryOf(await view("device", s.tillA.deviceId), "shift_close_difference_tolerance")?.value,
    ).toBe("0");
  });

  it("takes an invoicing profile through a provider this server has, and no other", async () => {
    const url = `/settings/branch/${s.shop.otherBranchId}/einvoice_profile`;
    expect((await call("PUT", url, EINVOICE_PROFILE)).status).toBe(200);
    expect(await call("PUT", url, { ...EINVOICE_PROFILE, provider: "nobody" })).toEqual({
      status: 400,
      body: { code: "API_EINVOICE_UNKNOWN_PROVIDER" },
    });
    expect(entryOf(await view("branch", s.shop.otherBranchId), "einvoice_profile")?.value).toEqual(
      EINVOICE_PROFILE,
    );
  });
});

describe("a write the settings routes refuse", () => {
  const invalid = { status: 400, body: { code: "API_INVALID_REQUEST" } };

  it.each<[string, string, unknown]>([
    ["a switch that is not on or off", "tables", "true"],
    ["a charge profile no till can price with", "charge_profile", { pricesIncludeTax: "yes" }],
    [
      "a rate above 100%",
      "charge_profile",
      {
        pricesIncludeTax: true,
        serviceCharge: { rate: 10_001, appliesTo: [], base: "after_discount", taxRate: 0 },
      },
    ],
    [
      "a bank account without a number",
      "payment_account",
      { bankBin: "970436", accountName: "PHO SANG" },
    ],
  ])("refuses %s, and no till is sent anything", async (_case, key, value) => {
    const { cursor } = await feedAfter(app, s.tillA.deviceToken);
    expect(await call("PUT", `/settings/branch/${s.shop.branchId}/${key}`, value)).toEqual(invalid);
    expect(await tillAConfigAfter(cursor)).toEqual([]);
  });

  it("refuses a key nobody knows", async () => {
    expect(await call("PUT", `/settings/branch/${s.shop.branchId}/free_drinks`, true)).toEqual({
      status: 404,
      body: { code: "API_SETTINGS_UNKNOWN_KEY" },
    });
  });

  it("refuses a body without a value, and a tolerance written as a number", async () => {
    const url = `/settings/device/${s.tillA.deviceId}/shift_close_difference_tolerance`;
    expect(await call("PUT", url)).toEqual(invalid);
    expect(await call("PUT", url, 20_000)).toEqual(invalid);
  });

  it("refuses a layer narrower than the key allows", async () => {
    const notHere = { status: 400, body: { code: "API_SETTINGS_LAYER_NOT_ALLOWED" } };
    expect(await call("PUT", `/settings/device/${s.tillA.deviceId}/tables`, true)).toEqual(notHere);
    expect(
      await call("PUT", `/settings/branch/${s.shop.branchId}/happy_hour_pricing`, true),
    ).toEqual(notHere);
    expect(await call("DELETE", `/settings/device/${s.tillA.deviceId}/charge_profile`)).toEqual(
      notHere,
    );
    expect((await call("PUT", `/settings/brand/${s.brandId}/tables`, false)).status).toBe(200);
  });
});
