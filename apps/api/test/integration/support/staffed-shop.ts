import { newId, withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { signedInMember } from "./backoffice-accounts";
import { pairDevice } from "./paired-devices";
import { type TenantGraph, seedTenantGraph } from "./tenant-graph";

export interface StaffedShop {
  tenant: TenantGraph;
  managerCookie: string;
  roleId: string;
  /** The tenant graph's branch, and a second one of the same tenant. */
  branchId: string;
  otherBranchId: string;
  /** A till paired to branchId, and one paired to otherBranchId. */
  deviceToken: string;
  deviceId: string;
  otherBranchDeviceToken: string;
}

/** A tenant with two branches, a cashier role, a signed-in manager and a till per branch. */
export async function staffedShop(app: FastifyInstance, pool: pg.Pool): Promise<StaffedShop> {
  const tenant = await seedTenantGraph(pool);
  const roleId = newId();
  const otherBranchId = newId();
  await withTenant(pool, tenant.tenantId, async (client) => {
    await client.query(
      "INSERT INTO role (id, tenant_id, name, permission_keys, thresholds) VALUES ($1, $2, $3, $4, $5)",
      [
        roleId,
        tenant.tenantId,
        "Thu ngân",
        ["order.create", "payment.take"],
        { maxDiscountBp: 1000 },
      ],
    );
    await client.query(
      "INSERT INTO branch (id, tenant_id, brand_id, name) VALUES ($1, $2, $3, $4)",
      [otherBranchId, tenant.tenantId, tenant.ids.brand, "Q3"],
    );
  });
  const { cookie } = await signedInMember(app, pool, tenant.tenantId);
  const till = await pairDevice(app, cookie, tenant.ids.branch, "Quầy Q1");
  const otherTill = await pairDevice(app, cookie, otherBranchId, "Quầy Q3");
  return {
    tenant,
    managerCookie: cookie,
    roleId,
    branchId: tenant.ids.branch,
    otherBranchId,
    deviceToken: till.deviceToken,
    deviceId: till.deviceId,
    otherBranchDeviceToken: otherTill.deviceToken,
  };
}

export function createStaff(
  app: FastifyInstance,
  shop: StaffedShop,
  body: { pin: string; branchIds?: string[]; roleId?: string; displayName?: string },
) {
  return app.inject({
    method: "POST",
    url: "/staff",
    headers: { cookie: shop.managerCookie },
    payload: {
      displayName: body.displayName ?? "Lan",
      roleId: body.roleId ?? shop.roleId,
      pin: body.pin,
      branchIds: body.branchIds ?? [shop.branchId],
    },
  });
}

/** Creates a staff member of the shop's first branch with `pin`, returning the id. */
export async function hire(app: FastifyInstance, shop: StaffedShop, pin: string): Promise<string> {
  const response = await createStaff(app, shop, { pin });
  if (response.statusCode !== 201) throw new Error(`creating staff answered ${response.body}`);
  return response.json().staffId;
}

export async function startShift(
  app: FastifyInstance,
  deviceToken: string,
  staffId: string,
  pin: string,
) {
  const response = await app.inject({
    method: "POST",
    url: "/pos/staff-sessions",
    headers: { authorization: `Device ${deviceToken}` },
    payload: { staffId, pin },
  });
  return { status: response.statusCode, body: response.json(), headers: response.headers };
}

export async function currentStaff(app: FastifyInstance, deviceToken: string, staffToken: string) {
  const response = await app.inject({
    method: "GET",
    url: "/pos/staff-sessions/current",
    headers: { authorization: `Device ${deviceToken}`, "x-staff-session": staffToken },
  });
  return { status: response.statusCode, body: response.json() };
}
