import { newId, provisionOrganization, withTenant } from "@fnb/db";
import type { RoleTemplateKey } from "@fnb/domain";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { PASSWORD, createAccount, signIn, uniqueEmail } from "./backoffice-accounts";
import { pairDevice } from "./paired-devices";

export interface StaffedShop {
  tenantId: string;
  /** The template roles the shop was provisioned with. */
  roleIds: Readonly<Record<RoleTemplateKey, string>>;
  /** The owner who created the shop, signed in to the backoffice. */
  managerCookie: string;
  /** The cashier template: the role staff get unless a test asks for another. */
  roleId: string;
  /** Two branches of the one brand. */
  branchId: string;
  otherBranchId: string;
  /** A till paired to branchId, and one paired to otherBranchId. */
  deviceToken: string;
  deviceId: string;
  otherBranchDeviceToken: string;
}

/** A shop provisioned the way sign-up does it, with two branches and a till in each. */
export async function staffedShop(app: FastifyInstance, pool: pg.Pool): Promise<StaffedShop> {
  const email = uniqueEmail("owner");
  const accountId = await createAccount(pool, { email });
  const shop = await provisionOrganization(pool, {
    name: "Công ty Phở Sáng",
    creator: { accountId, displayName: "Chủ quán" },
    now: new Date(),
  });
  const brandId = newId();
  const branchId = newId();
  const otherBranchId = newId();
  await withTenant(pool, shop.tenantId, async (client) => {
    await client.query("INSERT INTO brand (id, tenant_id, name) VALUES ($1, $2, 'Phở Sáng')", [
      brandId,
      shop.tenantId,
    ]);
    for (const [id, name] of [
      [branchId, "Q1"],
      [otherBranchId, "Q3"],
    ]) {
      await client.query(
        "INSERT INTO branch (id, tenant_id, brand_id, name) VALUES ($1, $2, $3, $4)",
        [id, shop.tenantId, brandId, name],
      );
    }
  });
  const cookie = await signIn(app, { email, password: PASSWORD });
  const till = await pairDevice(app, cookie, branchId, "Quầy Q1");
  const otherTill = await pairDevice(app, cookie, otherBranchId, "Quầy Q3");
  return {
    tenantId: shop.tenantId,
    roleIds: shop.roleIds,
    managerCookie: cookie,
    roleId: shop.roleIds.cashier,
    branchId,
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
export async function hire(
  app: FastifyInstance,
  shop: StaffedShop,
  pin: string,
  roleId = shop.roleId,
): Promise<string> {
  const response = await createStaff(app, shop, { pin, roleId });
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
