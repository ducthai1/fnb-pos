import { decodeRoleGrants, encodeRoleGrants, type StoredRoleGrants } from "@fnb/db";
import { uuidJsonSchema } from "../http/uuid-schema";

/** A role as the backoffice reads it: grants in their stored form, money as strings. */
export interface RoleView {
  id: string;
  name: string;
  permissionKeys: string[];
  thresholds: unknown;
  isTemplate: boolean;
  version: number;
}

export interface RoleRow {
  id: string;
  name: string;
  permission_keys: string[];
  thresholds: unknown;
  is_template: boolean;
  version: number;
}

export const ROLE_COLUMNS = "id, name, permission_keys, thresholds, is_template, version";

export function roleView(row: RoleRow): RoleView {
  return {
    id: row.id,
    name: row.name,
    permissionKeys: row.permission_keys,
    thresholds: row.thresholds,
    isTemplate: row.is_template,
    version: row.version,
  };
}

/**
 * Submitted grants, checked by the domain and put in canonical stored form. Throws the
 * domain's permissions error for anything it would not accept; routes map it to a 400.
 */
export function canonicalGrants(permissionKeys: string[], thresholds: unknown): StoredRoleGrants {
  return encodeRoleGrants(decodeRoleGrants(permissionKeys, thresholds));
}

const name = { type: "string", minLength: 1, maxLength: 80, pattern: "\\S" } as const;
const permissionKeys = {
  type: "array",
  maxItems: 64,
  uniqueItems: true,
  items: { type: "string", maxLength: 64 },
} as const;
// Only the outer shape here: what each limit must look like is the domain's rule, and
// it answers with its own code instead of the generic 400.
const thresholds = { type: "object", maxProperties: 64 } as const;

/** Both grant fields are required, so forgetting the limits never means "no limits". */
export const createRoleBody = {
  type: "object",
  additionalProperties: false,
  required: ["name", "permissionKeys", "thresholds"],
  properties: { name, permissionKeys, thresholds },
} as const;

/** Grants are replaced as a whole: keys alone would silently drop the limits on them. */
export const updateRoleBody = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: { name, permissionKeys, thresholds },
  dependencies: { permissionKeys: ["thresholds"], thresholds: ["permissionKeys"] },
} as const;

export const roleParams = {
  type: "object",
  required: ["id"],
  properties: { id: uuidJsonSchema },
} as const;
