import type { PosBootstrap } from "@fnb/contracts";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import {
  type MilkTeaTillShop,
  bootstrapOf,
  milkTeaTillShop,
  requestBootstrap,
} from "../support/milk-tea-till-shop";
import { secretKeysIn } from "../support/secret-keys";

const info = inject("testPostgres");
const REFUSED = { status: 401, body: { code: "API_DEVICE_UNAUTHENTICATED" } };

let pool: pg.Pool;
let app: FastifyInstance;
let m: MilkTeaTillShop;
let otherShop: MilkTeaTillShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool });
  m = await milkTeaTillShop(app, pool);
  otherShop = await milkTeaTillShop(app, pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

/** Every id anywhere in a bootstrap, to compare what two tills were shown. */
function idsIn(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const item of value) idsIn(item, found);
  else if (typeof value === "object" && value !== null) {
    for (const [key, inner] of Object.entries(value)) {
      if (key === "id" && typeof inner === "string") found.add(inner);
      idsIn(inner, found);
    }
  }
  return found;
}

describe("which shop a bootstrap shows", () => {
  it("shows a till its own shop's menu and staff, and none of another shop's", async () => {
    const own = idsIn(await bootstrapOf(app, m.s.tillA.deviceToken));
    const other = idsIn(await bootstrapOf(app, otherShop.s.tillA.deviceToken));
    expect(own.has(m.tea.ids.product)).toBe(true);
    expect(own.has(m.s.tillA.staffId)).toBe(true);
    expect(other.has(otherShop.tea.ids.product)).toBe(true);
    expect([...own].filter((id) => other.has(id))).toEqual([]);
  });

  it("shows a till of the other branch that branch's stations and staff only", async () => {
    const q1 = await bootstrapOf(app, m.s.tillA.deviceToken);
    const q3: PosBootstrap = await bootstrapOf(app, m.s.otherBranchTill.deviceToken);
    expect(q3.device.branchId).toBe(m.s.shop.otherBranchId);
    expect(q3.menu.stations.map((station) => station.id)).toEqual([m.otherStationId]);
    expect(q3.staff.map((member) => member.id)).toEqual([m.s.otherBranchTill.staffId]);
    expect(q1.staff.map((member) => member.id)).not.toContain(m.s.otherBranchTill.staffId);
    // Same brand, so the same menu.
    expect(q3.menu.products.map((p) => p.id)).toEqual(q1.menu.products.map((p) => p.id));
  });
});

describe("who may bootstrap", () => {
  it("answers a paired till and refuses it once its pairing is revoked", async () => {
    const till = m.s.tillB;
    expect((await requestBootstrap(app, `Device ${till.deviceToken}`)).status).toBe(200);
    await m.manage("POST", `/devices/${till.deviceId}/revoke`);
    expect(await requestBootstrap(app, `Device ${till.deviceToken}`)).toEqual(REFUSED);
  });

  it("refuses a request without a till credential", async () => {
    expect(await requestBootstrap(app)).toEqual(REFUSED);
    expect(await requestBootstrap(app, "Device not-a-token")).toEqual(REFUSED);
  });
});

describe("what a bootstrap never carries", () => {
  it("names no secret anywhere, the staff list included", async () => {
    const { status, body } = await requestBootstrap(app, `Device ${m.s.tillA.deviceToken}`);
    expect(status).toBe(200);
    expect(secretKeysIn(body)).toEqual([]);
  });

  it("would notice a secret if one slipped in, at any depth", () => {
    const planted = {
      staff: [{ id: "x", displayName: "Lan", pinHash: "…" }],
      device: { token_hash: "…" },
    };
    expect(secretKeysIn(planted)).toEqual([".staff.0.pinHash", ".device.token_hash"]);
    expect(secretKeysIn({ menu: { products: [{ printCupLabel: true }] } })).toEqual([]);
  });
});
