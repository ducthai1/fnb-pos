import {
  DB_ERROR_CODES,
  type DeviceConfigLayers,
  isDatabaseError,
  newId,
  readConfigLayersForDevice,
  withTenant,
} from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import {
  FEATURE_FLAGS_ERROR_CODES,
  featureFlagDefaults,
  resolveConfig,
  validateFlags,
} from "@fnb/feature-flags";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { postgresErrorCode } from "../support/postgres-error-code";
import { type TenantGraph, seedTenantGraph } from "../support/tenant-graph";

const info = inject("testPostgres");
const SYSTEM = { ...featureFlagDefaults(), cash_rounding_step: "0", receipt_footer: "Cảm ơn" };

let app: pg.Pool;
let a: TenantGraph;
let b: TenantGraph;
// Tenant A: the seeded till, a second till in the same branch, and a till in a second branch.
const sameBranchDevice = newId();
const otherBranch = newId();
const otherBranchDevice = newId();

const inA = <T>(work: (client: pg.PoolClient) => Promise<T>) => withTenant(app, a.tenantId, work);
const setConfig = (
  client: pg.ClientBase,
  kind: string,
  scopeId: string,
  key: string,
  value: unknown,
) =>
  client.query(
    `INSERT INTO config_value (id, tenant_id, scope_kind, scope_id, key, value)
     VALUES ($1, current_setting('app.tenant_id')::uuid, $2, $3, $4, $5::jsonb)`,
    [newId(), kind, scopeId, key, JSON.stringify(value)],
  );

beforeAll(async () => {
  app = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  a = await seedTenantGraph(app);
  b = await seedTenantGraph(app);
  await inA(async (client) => {
    const insertDevice =
      "INSERT INTO device (id, tenant_id, branch_id, name) VALUES ($1, $2, $3, 'x')";
    await client.query(
      "INSERT INTO branch (id, tenant_id, brand_id, name) VALUES ($1, $2, $3, 'Q3')",
      [otherBranch, a.tenantId, a.ids.brand],
    );
    await client.query(insertDevice, [sameBranchDevice, a.tenantId, a.ids.branch]);
    await client.query(insertDevice, [otherBranchDevice, a.tenantId, otherBranch]);
    // The seeded till already turns cup_labels on for itself.
    await setConfig(client, "brand", a.ids.brand, "cash_rounding_step", "500");
    await setConfig(client, "brand", a.ids.brand, "receipt_footer", "Hẹn gặp lại");
    await setConfig(client, "brand", a.ids.brand, "qr_ordering", true);
    await setConfig(client, "branch", a.ids.branch, "cash_rounding_step", "1000");
    await setConfig(client, "branch", a.ids.branch, "tables", true);
    await setConfig(client, "device", a.ids.device, "pay_first_counter", false);
  });
  await withTenant(app, b.tenantId, (client) =>
    setConfig(client, "brand", b.ids.brand, "receipt_footer", "tenant B"),
  );
});

afterAll(async () => {
  await app.end();
});

const layersOf = (deviceId: string) => inA((client) => readConfigLayersForDevice(client, deviceId));
const resolve = (layers: DeviceConfigLayers, key: string) =>
  resolveConfig(key, { ...layers, system: SYSTEM });

describe("configuration layers of a device", () => {
  it("name the device's branch and brand and hold only what each layer changed", async () => {
    const layers = await layersOf(a.ids.device);
    expect(layers).toEqual({
      deviceId: a.ids.device,
      branchId: a.ids.branch,
      brandId: a.ids.brand,
      brand: { cash_rounding_step: "500", receipt_footer: "Hẹn gặp lại", qr_ordering: true },
      branch: { cash_rounding_step: "1000", tables: true },
      device: { cup_labels: true, pay_first_counter: false },
    });
  });

  it("resolve each setting from the most specific layer that changed it", async () => {
    const layers = await layersOf(a.ids.device);
    expect(
      ["cash_rounding_step", "receipt_footer", "cup_labels", "pay_first_counter", "einvoice"].map(
        (key) => resolve(layers, key),
      ),
    ).toEqual([
      { value: "1000", source: "branch" },
      { value: "Hẹn gặp lại", source: "brand" },
      { value: true, source: "device" },
      { value: false, source: "device" },
      { value: false, source: "system" },
    ]);
  });

  it("do not leak one till's settings to another till of the same branch", async () => {
    const layers = await layersOf(sameBranchDevice);
    expect(layers.device).toEqual({});
    expect(resolve(layers, "cup_labels")).toEqual({ value: false, source: "system" });
    expect(resolve(layers, "cash_rounding_step")).toEqual({ value: "1000", source: "branch" });
  });

  it("give a till in another branch the brand's value, and catch a flag its branch cannot support", async () => {
    const layers = await layersOf(otherBranchDevice);
    expect(layers.branch).toEqual({});
    expect(resolve(layers, "cash_rounding_step")).toEqual({ value: "500", source: "brand" });
    const flags = Object.fromEntries(
      ["qr_ordering", "tables"].map((key) => [key, resolve(layers, key).value]),
    );
    expect(validateFlags(flags)).toEqual([
      { code: FEATURE_FLAGS_ERROR_CODES.requiresMissing, flag: "qr_ordering", other: "tables" },
    ]);
  });

  it("keep a stored key named like a prototype property as plain data", async () => {
    await inA((client) => setConfig(client, "device", otherBranchDevice, "__proto__", "x"));
    const { device } = await layersOf(otherBranchDevice);
    expect({ own: Object.hasOwn(device, "__proto__"), value: device["__proto__"] }).toEqual({
      own: true,
      value: "x",
    });
  });

  it("refuse a device of another tenant or one that does not exist", async () => {
    for (const deviceId of [b.ids.device, newId()]) {
      const error = await layersOf(deviceId).catch((caught: unknown) => caught);
      expect(isDatabaseError(error, DB_ERROR_CODES.configDeviceNotFound)).toBe(true);
    }
  });
});

describe("a stored config value", () => {
  it("is one per scope and key", async () => {
    const code = await inA((client) =>
      postgresErrorCode(() => setConfig(client, "branch", a.ids.branch, "tables", false)),
    );
    expect(code).toBe("23505");
  });

  it("must name a scope of its own kind: a device id is not a branch", async () => {
    const codes = await Promise.all(
      [
        ["branch", a.ids.device],
        ["brand", a.ids.branch],
        ["device", a.ids.brand],
      ].map(([kind, scopeId]) =>
        inA((client) => postgresErrorCode(() => setConfig(client, kind!, scopeId!, "x", 1))),
      ),
    );
    expect(codes).toEqual(["23503", "23503", "23503"]);
  });

  it("must have a known scope kind", async () => {
    const code = await inA((client) =>
      postgresErrorCode(() => setConfig(client, "organization", a.tenantId, "x", 1)),
    );
    expect(code).toBe("23514");
  });
});
