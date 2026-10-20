import type { ConfigScopeKind } from "@fnb/contracts";
import type pg from "pg";

type Layer = Record<string, unknown>;

/** A brand, branch or till with the scopes above it, and what each of them stores. */
export interface ScopeConfig {
  readonly kind: ConfigScopeKind;
  readonly id: string;
  readonly brandId: string;
  readonly branchId: string | null;
  readonly deviceId: string | null;
  readonly layers: { brand: Layer; branch?: Layer; device?: Layer };
}

const CHAIN: Readonly<Record<ConfigScopeKind, string>> = {
  brand:
    "SELECT id AS brand_id, NULL::uuid AS branch_id, NULL::uuid AS device_id FROM brand WHERE id = $1",
  branch: "SELECT brand_id, id AS branch_id, NULL::uuid AS device_id FROM branch WHERE id = $1",
  device:
    "SELECT b.brand_id, d.branch_id, d.id AS device_id FROM device d " +
    "JOIN branch b ON b.tenant_id = d.tenant_id AND b.id = d.branch_id WHERE d.id = $1",
};

// Object.create(null): stored keys are data, so one named "__proto__" stays a plain key.
const emptyLayer = () => Object.create(null) as Layer;

/**
 * The scope and the layers along its chain, read inside withTenant; null when the scope is
 * not in the current tenant (another tenant's rows are invisible, so they read as missing).
 */
export async function readScopeConfig(
  client: pg.ClientBase,
  kind: ConfigScopeKind,
  id: string,
): Promise<ScopeConfig | null> {
  const chain = await client.query<{
    brand_id: string;
    branch_id: string | null;
    device_id: string | null;
  }>(CHAIN[kind], [id]);
  const found = chain.rows[0];
  if (found === undefined) return null;
  const { rows } = await client.query<{ scope_kind: ConfigScopeKind; key: string; value: unknown }>(
    "SELECT scope_kind, key, value FROM config_value WHERE (scope_kind = 'brand' AND scope_id = $1) " +
      "OR (scope_kind = 'branch' AND scope_id = $2::uuid) OR (scope_kind = 'device' AND scope_id = $3::uuid)",
    [found.brand_id, found.branch_id, found.device_id],
  );
  const layers: ScopeConfig["layers"] = { brand: emptyLayer() };
  if (found.branch_id !== null) layers.branch = emptyLayer();
  if (found.device_id !== null) layers.device = emptyLayer();
  for (const row of rows) {
    const layer = layers[row.scope_kind];
    if (layer !== undefined) layer[row.key] = row.value;
  }
  return {
    kind,
    id,
    brandId: found.brand_id,
    branchId: found.branch_id,
    deviceId: found.device_id,
    layers,
  };
}
