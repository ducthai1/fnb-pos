import { type ApiResult, type FetchLike, requestJson, resultOf } from "./api-result";
import { isRecord, listUnder, textOf, wholeNumberOf } from "./read-json-fields";

/**
 * A limit as the API stores it, under the key it caps:
 * `{ line_discount: { maxRate: 1000 }, cash_move: { maxAmount: "500000" } }` — the rate in
 * basis points, the amount as a decimal string of whole đồng.
 */
export type StoredThreshold = { readonly maxRate: number } | { readonly maxAmount: string };
export type StoredThresholds = Readonly<Record<string, StoredThreshold>>;

export interface Role {
  readonly id: string;
  readonly name: string;
  readonly permissionKeys: readonly string[];
  readonly thresholds: StoredThresholds;
  readonly isTemplate: boolean;
  readonly version: number;
}

/** Name and grants together: the API replaces keys and limits as a whole. */
export interface RoleGrantsBody {
  readonly name: string;
  readonly permissionKeys: readonly string[];
  readonly thresholds: StoredThresholds;
}

function readThresholds(value: unknown): StoredThresholds | null {
  if (!isRecord(value)) return null;
  const read: Record<string, StoredThreshold> = {};
  for (const [key, limit] of Object.entries(value)) {
    if (!isRecord(limit)) return null;
    const maxRate = wholeNumberOf(limit, "maxRate");
    const maxAmount = textOf(limit, "maxAmount");
    if (maxRate !== null) read[key] = { maxRate };
    else if (maxAmount !== null) read[key] = { maxAmount };
    else return null;
  }
  return read;
}

const readRole = (item: Record<string, unknown>): Role | null => {
  const id = textOf(item, "id");
  const name = textOf(item, "name");
  const version = wholeNumberOf(item, "version");
  const thresholds = readThresholds(item.thresholds);
  const keys = item.permissionKeys;
  if (id === null || name === null || version === null || thresholds === null) return null;
  if (!Array.isArray(keys) || !keys.every((key) => typeof key === "string")) return null;
  if (typeof item.isTemplate !== "boolean") return null;
  return { id, name, permissionKeys: keys, thresholds, isTemplate: item.isTemplate, version };
};

export interface RolesApi {
  listRoles(): Promise<ApiResult<Role[]>>;
  createRole(body: RoleGrantsBody): Promise<ApiResult<{ roleId: string }>>;
  updateRole(roleId: string, body: RoleGrantsBody): Promise<ApiResult<Role>>;
}

export function httpRolesApi(base: string, fetchImpl: FetchLike): RolesApi {
  return {
    async listRoles() {
      const answer = await requestJson(fetchImpl, `${base}/roles`, { method: "GET" });
      return resultOf(answer, (body) => listUnder(body, "roles", readRole));
    },
    async createRole(body) {
      const answer = await requestJson(fetchImpl, `${base}/roles`, { method: "POST", body });
      return resultOf(answer, (reply) => {
        const roleId = isRecord(reply) ? textOf(reply, "roleId") : null;
        return roleId === null ? null : { roleId };
      });
    },
    async updateRole(roleId, body) {
      const url = `${base}/roles/${encodeURIComponent(roleId)}`;
      const answer = await requestJson(fetchImpl, url, { method: "PATCH", body });
      return resultOf(answer, (reply) => (isRecord(reply) ? readRole(reply) : null));
    },
  };
}
