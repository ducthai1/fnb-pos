import type pg from "pg";
import { DatabaseError } from "../database-error";
import { DB_ERROR_CODES } from "../db-error-codes";

type ConfigLayer = Record<string, unknown>;

/**
 * What the brand, branch and device of one till changed, ready to stack on the system
 * defaults (resolveConfig in @fnb/feature-flags). Values are parsed jsonb; money settings
 * are stored as decimal strings, like audit payloads, so they stay exact.
 */
export interface DeviceConfigLayers {
  deviceId: string;
  branchId: string;
  brandId: string;
  brand: ConfigLayer;
  branch: ConfigLayer;
  device: ConfigLayer;
}

// One round trip for the device's scope chain and all settings along it. The join on
// (tenant_id, id) and row level security keep both halves inside the current tenant.
const READ_LAYERS = `
  WITH chain AS (
    SELECT d.id AS device_id, d.branch_id, b.brand_id
    FROM device d JOIN branch b ON b.tenant_id = d.tenant_id AND b.id = d.branch_id
    WHERE d.id = $1
  )
  SELECT chain.device_id, chain.branch_id, chain.brand_id, c.scope_kind, c.key, c.value
  FROM chain
  LEFT JOIN config_value c ON
       (c.scope_kind = 'brand' AND c.scope_id = chain.brand_id)
    OR (c.scope_kind = 'branch' AND c.scope_id = chain.branch_id)
    OR (c.scope_kind = 'device' AND c.scope_id = chain.device_id)`;

interface LayerRow {
  device_id: string;
  branch_id: string;
  brand_id: string;
  scope_kind: "brand" | "branch" | "device" | null;
  key: string | null;
  value: unknown;
}

/**
 * Reads the configuration layers of a device inside withTenant. A device that does not
 * exist, or belongs to another tenant, is an error rather than empty layers, because empty
 * layers would quietly run the till on defaults.
 */
export async function readConfigLayersForDevice(
  client: pg.ClientBase,
  deviceId: string,
): Promise<DeviceConfigLayers> {
  const { rows } = await client.query<LayerRow>(READ_LAYERS, [deviceId]);
  const first = rows[0];
  if (first === undefined) {
    throw new DatabaseError(
      DB_ERROR_CODES.configDeviceNotFound,
      `no device ${deviceId} in the current tenant`,
    );
  }
  // Object.create(null): stored keys are data, and one named "__proto__" must become a
  // plain key instead of replacing the object's prototype.
  const layers: DeviceConfigLayers = {
    deviceId: first.device_id,
    branchId: first.branch_id,
    brandId: first.brand_id,
    brand: Object.create(null) as ConfigLayer,
    branch: Object.create(null) as ConfigLayer,
    device: Object.create(null) as ConfigLayer,
  };
  for (const row of rows) {
    if (row.scope_kind !== null && row.key !== null) layers[row.scope_kind][row.key] = row.value;
  }
  return layers;
}
