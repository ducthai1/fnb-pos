import type { ConfigScopeKind } from "@fnb/contracts";
import {
  FEATURE_FLAG_KEYS,
  type FlagViolation,
  featureFlagDefaults,
  resolveConfig,
  validateFlags,
} from "@fnb/feature-flags";
import type pg from "pg";
import type { ScopeConfig } from "./read-scope-config";

type Layer = Record<string, unknown>;

/** A broken flag rule, and the brand, branch or till where the switches combine that way. */
export interface ScopedFlagViolation {
  readonly violation: FlagViolation;
  readonly scopeKind: ConfigScopeKind;
  readonly scopeId: string;
}

interface Node {
  kind: ConfigScopeKind;
  id: string;
  branchId: string | null;
  deviceId: string | null;
}

/**
 * The first flag rule broken anywhere under `scope`, as the switches resolve there now
 * (call it after a write, inside the same transaction, so the write is judged together
 * with everything it combines with). A brand switch is judged at the brand, at each of
 * its branches and at each of their tills, since a value set lower down may now conflict
 * with it; a till is the narrowest place switches combine.
 */
export async function flagViolationUnder(
  client: pg.ClientBase,
  scope: ScopeConfig,
): Promise<ScopedFlagViolation | null> {
  const { rows: places } = await client.query<{ branch_id: string; device_id: string | null }>(
    "SELECT b.id AS branch_id, d.id AS device_id FROM branch b " +
      "LEFT JOIN device d ON d.tenant_id = b.tenant_id AND d.branch_id = b.id " +
      "WHERE b.brand_id = $1 AND ($2::uuid IS NULL OR b.id = $2) AND ($3::uuid IS NULL OR d.id = $3) " +
      "ORDER BY b.id, d.id",
    [scope.brandId, scope.branchId, scope.deviceId],
  );
  const { rows: stored } = await client.query<{
    scope_kind: ConfigScopeKind;
    scope_id: string;
    key: string;
    value: unknown;
  }>(
    "SELECT c.scope_kind, c.scope_id, c.key, c.value FROM config_value c WHERE c.key = ANY($2::text[]) AND " +
      "(c.brand_id = $1 OR c.branch_id IN (SELECT id FROM branch WHERE brand_id = $1) OR c.device_id IN " +
      "(SELECT d.id FROM device d JOIN branch b ON b.tenant_id = d.tenant_id AND b.id = d.branch_id WHERE b.brand_id = $1))",
    [scope.brandId, [...FEATURE_FLAG_KEYS]],
  );
  const layerOf = (kind: ConfigScopeKind, id: string): Layer =>
    Object.fromEntries(
      stored
        .filter((row) => row.scope_kind === kind && row.scope_id === id)
        .map((row) => [row.key, row.value]),
    );

  const nodes: Node[] =
    scope.kind === "brand"
      ? [{ kind: "brand", id: scope.brandId, branchId: null, deviceId: null }]
      : [];
  for (const place of places) {
    const branchNode = {
      kind: "branch" as const,
      id: place.branch_id,
      branchId: place.branch_id,
      deviceId: null,
    };
    if (
      scope.kind !== "device" &&
      !nodes.some((node) => node.kind === "branch" && node.id === place.branch_id)
    ) {
      nodes.push(branchNode);
    }
    if (place.device_id !== null) {
      nodes.push({
        kind: "device",
        id: place.device_id,
        branchId: place.branch_id,
        deviceId: place.device_id,
      });
    }
  }

  const system = featureFlagDefaults();
  for (const node of nodes) {
    const layers = {
      system,
      brand: layerOf("brand", scope.brandId),
      branch: node.branchId === null ? undefined : layerOf("branch", node.branchId),
      device: node.deviceId === null ? undefined : layerOf("device", node.deviceId),
    };
    const resolved = Object.fromEntries(
      FEATURE_FLAG_KEYS.map((key) => [key, resolveConfig(key, layers).value]),
    );
    const [violation] = validateFlags(resolved);
    if (violation !== undefined) return { violation, scopeKind: node.kind, scopeId: node.id };
  }
  return null;
}
