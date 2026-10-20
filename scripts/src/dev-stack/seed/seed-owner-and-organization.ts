import { hashSecret } from "@fnb/api/secret-hash";
import { newId, provisionOrganization, withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import type { DevStackLogins } from "../dev-stack-generated-logins";

export const SAMPLE_SHOP = {
  organization: "Cà phê Mẫu",
  brand: "Cà phê Mẫu",
  branch: "Cà phê Mẫu - Quận 1",
  /** Vietnam time, and the business day starting at 04:00, as the branch defaults are. */
  utcOffsetMinutes: 420,
  businessDayStartMinute: 240,
} as const;

export interface SeededOrganization {
  readonly tenantId: string;
  readonly brandId: string;
  readonly branchId: string;
  /** The owner signed in to the backoffice. */
  readonly cookie: string;
}

/**
 * The owner's account and organization, the way sign-up makes them (the account through
 * fnb_auth, the organization with its template roles through provisionOrganization), then
 * the brand and the branch, which no route creates yet. Each piece already there is kept.
 */
export async function seedOwnerAndOrganization(
  app: FastifyInstance,
  pool: pg.Pool,
  owner: DevStackLogins["owner"],
): Promise<SeededOrganization> {
  const signedIn = await signInCreatingWhatIsMissing(app, pool, owner);
  const tenantId = signedIn.organizationId;
  const { brandId, branchId } = await withTenant(pool, tenantId, async (client) => {
    const brand = await idByName(client, "brand", SAMPLE_SHOP.brand, (id) =>
      client.query("INSERT INTO brand (id, tenant_id, name) VALUES ($1, $2, $3)", [
        id,
        tenantId,
        SAMPLE_SHOP.brand,
      ]),
    );
    const branch = await idByName(client, "branch", SAMPLE_SHOP.branch, (id) =>
      client.query(
        "INSERT INTO branch (id, tenant_id, brand_id, name, utc_offset_minutes, " +
          "business_day_start_minute) VALUES ($1, $2, $3, $4, $5, $6)",
        [
          id,
          tenantId,
          brand,
          SAMPLE_SHOP.branch,
          SAMPLE_SHOP.utcOffsetMinutes,
          SAMPLE_SHOP.businessDayStartMinute,
        ],
      ),
    );
    return { brandId: brand, branchId: branch };
  });
  return { tenantId, brandId, branchId, cookie: signedIn.cookie };
}

async function signInCreatingWhatIsMissing(
  app: FastifyInstance,
  pool: pg.Pool,
  owner: DevStackLogins["owner"],
): Promise<{ organizationId: string; cookie: string }> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: owner.email, password: owner.password },
    });
    if (response.statusCode === 200) {
      const cookie = String(response.headers["set-cookie"]).split(";")[0] ?? "";
      return { organizationId: response.json().organizationId as string, cookie };
    }
    const code = response.json().code as string;
    if (response.statusCode === 401) {
      await pool.query("SELECT fnb_auth.create_account($1, $2, NULL, $3, now())", [
        owner.accountId,
        owner.email,
        await hashSecret(owner.password),
      ]);
    } else if (code === "API_AUTH_NO_ACTIVE_MEMBERSHIP") {
      await provisionOrganization(pool, {
        organizationId: owner.organizationId,
        name: SAMPLE_SHOP.organization,
        creator: { accountId: owner.accountId, displayName: "Chủ quán" },
        now: new Date(),
      });
    } else {
      throw new Error(`signing the owner in answered ${response.statusCode}: ${response.body}`);
    }
  }
  throw new Error("the owner could not be signed in after creating the account");
}

async function idByName(
  client: pg.PoolClient,
  table: "brand" | "branch",
  name: string,
  insert: (id: string) => Promise<unknown>,
): Promise<string> {
  const found = await client.query<{ id: string }>(
    `SELECT id FROM ${table} WHERE name = $1 ORDER BY id LIMIT 1`,
    [name],
  );
  const existing = found.rows[0]?.id;
  if (existing !== undefined) return existing;
  const id = newId();
  await insert(id);
  return id;
}
