import { withTenant } from "@fnb/db";
import type { RoleTemplateKey } from "@fnb/domain";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { requestApproval } from "./approval-requests";
import { hire, startShift } from "./staffed-shop";
import type { SyncShop, Till } from "./sync-shop";

const PIN = "4826";

/** A manager of the shop's first branch, who approves at its tills with their PIN. */
export const hireManager = (app: FastifyInstance, s: SyncShop) =>
  hire(app, s.shop, PIN, s.shop.roleIds.manager);

/** Signs a new staff member of `role` in on `till`, who then sends its commands. */
export async function signInAs(
  app: FastifyInstance,
  s: SyncShop,
  till: Till,
  role: RoleTemplateKey,
) {
  const staffId = await hire(app, s.shop, PIN, s.shop.roleIds[role]);
  const shift = await startShift(app, till.deviceToken, staffId, PIN);
  if (shift.status !== 201) throw new Error(`starting a shift answered ${shift.status}`);
  till.staffId = staffId;
  till.staffToken = shift.body.staffSessionToken;
}

/** The manager approves `action` for whoever is signed in on `till`; answers its id. */
export async function approve(
  app: FastifyInstance,
  till: Till,
  managerId: string,
  action: { key: string; discountRate?: number; amount?: string },
): Promise<string> {
  const answer = await requestApproval(app, till.deviceToken, till.staffToken, {
    action,
    approverStaffId: managerId,
    approverPin: PIN,
  });
  if (answer.status !== 201) throw new Error(`approval answered ${answer.status}`);
  return answer.body.approvalId as string;
}

/** When the server recorded the approval, in epoch ms. */
export async function approvedAt(pool: pg.Pool, tenantId: string, approvalId: string) {
  return withTenant(pool, tenantId, async (client) => {
    const { rows } = await client.query("SELECT created_at FROM approval_log WHERE id = $1", [
      approvalId,
    ]);
    return (rows[0].created_at as Date).getTime();
  });
}

/**
 * The wall clock as an instant: approvals are timed by the database, so a command relying
 * on one is dated when it is made, as a till right next to the manager would date it.
 */
export const justNow = () => new Date().toISOString();
