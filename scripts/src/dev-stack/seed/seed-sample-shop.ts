import type { FastifyInstance } from "fastify";
import type pg from "pg";
import type { DevStackLogins } from "../dev-stack-generated-logins";
import { backofficeCaller } from "./backoffice-caller";
import { seedBranchSettings } from "./seed-branch-settings";
import { seedOwnerAndOrganization } from "./seed-owner-and-organization";
import { seedSampleFloor } from "./seed-sample-floor";
import { seedSampleMenu } from "./seed-sample-menu";
import { seedSamplePhotos } from "./seed-sample-photos";
import { type SeededStaff, seedSampleStaff } from "./seed-sample-staff";

export interface SampleShop {
  readonly tenantId: string;
  readonly brandId: string;
  readonly branchId: string;
  readonly staff: readonly SeededStaff[];
  readonly productCount: number;
  /** Products given a photo; 0 when the server keeps no photos. */
  readonly photoCount: number;
  readonly tableCount: number;
  /** New on every run: what a till types to pair with the branch. */
  readonly pairingCode: { readonly code: string; readonly expiresAt: string };
}

/**
 * The sample café "Cà phê Mẫu", built through the same routes and domain functions the
 * backoffice uses, against the app role: nothing reaches the database that the rules would
 * refuse. Safe to run again on the same database: what is there is kept, nothing is made
 * twice, and only the pairing code is new each time.
 */
export async function seedSampleShop(
  app: FastifyInstance,
  pool: pg.Pool,
  logins: DevStackLogins,
): Promise<SampleShop> {
  const shop = await seedOwnerAndOrganization(app, pool, logins.owner);
  const call = backofficeCaller(app, shop.cookie);
  await seedBranchSettings(call, shop.branchId, logins.sepaySecret);
  const products = await seedSampleMenu(call, shop);
  const photoCount = await seedSamplePhotos(app, shop.cookie, call, products);
  const tableCount = await seedSampleFloor(call, shop.branchId);
  const staff = await seedSampleStaff(call, shop.branchId, logins.staffPins);
  const pairingCode = await call<{ code: string; expiresAt: string }>(
    "POST",
    "/devices/pairing-codes",
    { branchId: shop.branchId },
    201,
  );
  return {
    tenantId: shop.tenantId,
    brandId: shop.brandId,
    branchId: shop.branchId,
    staff,
    productCount: products.size,
    photoCount,
    tableCount,
    pairingCode: { code: pairingCode.code, expiresAt: pairingCode.expiresAt },
  };
}
