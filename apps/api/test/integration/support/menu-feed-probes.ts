import { newId, withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import type { SyncChange, SyncChangesPage } from "../../../src/sync/sync-wire-types";
import { pairDevice } from "./paired-devices";
import type { StaffedShop } from "./staffed-shop";

/** Every change a till's credential pulls after `cursor`, page by page, and where it ends. */
export async function feedAfter(app: FastifyInstance, deviceToken: string, cursor = "0") {
  const changes: SyncChange[] = [];
  for (let next = cursor; ;) {
    const response = await app.inject({
      method: "GET",
      url: `/sync/changes?cursor=${next}&limit=500`,
      headers: { authorization: `Device ${deviceToken}` },
    });
    if (response.statusCode !== 200) {
      throw new Error(`pull answered ${response.statusCode}: ${response.body}`);
    }
    const page = response.json() as SyncChangesPage;
    if (page.changes.length === 0) return { changes, cursor: next };
    changes.push(...page.changes);
    next = page.nextCursor;
  }
}

/** The changes of one entity, optionally of one id, in feed order. */
export const changesOf = (changes: readonly SyncChange[], entity: string, entityId?: string) =>
  changes.filter(
    (change) =>
      change.entity === entity && (entityId === undefined || change.entityId === entityId),
  );

/** A copy as the feed carries it, without the version a till orders copies by. */
export function withoutVersion(copy: unknown): Record<string, unknown> {
  const rest = { ...(copy as Record<string, unknown>) };
  delete rest.version;
  return rest;
}

export interface OtherBrandTill {
  brandId: string;
  branchId: string;
  deviceId: string;
  deviceToken: string;
}

/** A second brand of the shop's own tenant, with one branch and a till paired to it. */
export async function otherBrandTill(
  app: FastifyInstance,
  pool: pg.Pool,
  shop: StaffedShop,
): Promise<OtherBrandTill> {
  const brandId = newId();
  const branchId = newId();
  await withTenant(pool, shop.tenantId, async (client) => {
    await client.query("INSERT INTO brand (id, tenant_id, name) VALUES ($1, $2, 'Bánh Mì Chiều')", [
      brandId,
      shop.tenantId,
    ]);
    await client.query(
      "INSERT INTO branch (id, tenant_id, brand_id, name) VALUES ($1, $2, $3, 'Q7')",
      [branchId, shop.tenantId, brandId],
    );
  });
  const till = await pairDevice(app, shop.managerCookie, branchId, "Quầy Q7");
  return { brandId, branchId, deviceId: till.deviceId, deviceToken: till.deviceToken };
}
