import { type EInvoiceProfile, einvoiceProfileSettingSchema } from "@fnb/contracts";
import { type ConfigSource, configDefaults, resolveConfig } from "@fnb/feature-flags";
import type pg from "pg";

export const EINVOICE_PROFILE_KEY = "einvoice_profile";

export type BranchEInvoiceProfile =
  | { readonly status: "unset"; readonly source: ConfigSource }
  | { readonly status: "set"; readonly profile: EInvoiceProfile; readonly source: ConfigSource }
  /** A stored value the contract refuses: the shop must fix it, nobody may guess it. */
  | { readonly status: "unreadable"; readonly source: ConfigSource };

type Layer = Record<string, unknown>;

/**
 * The branch's invoicing profile: its own value, else its brand's, else none. A till-level
 * value is ignored on purpose: a branch invoices as one seller, and two tills of a branch
 * issuing under different tax codes would split one shop's sales between two sellers.
 * Null when there is no such branch in the current tenant.
 */
export async function readBranchEInvoiceProfile(
  client: pg.ClientBase,
  branchId: string,
): Promise<BranchEInvoiceProfile | null> {
  const { rows } = await client.query<{ scope_kind: string | null; value: unknown }>(
    "SELECT c.scope_kind, c.value FROM branch b " +
      "LEFT JOIN config_value c ON c.key = $2 AND ((c.scope_kind = 'branch' AND c.scope_id = b.id) " +
      "OR (c.scope_kind = 'brand' AND c.scope_id = b.brand_id)) " +
      "WHERE b.id = $1",
    [branchId, EINVOICE_PROFILE_KEY],
  );
  if (rows.length === 0) return null;
  const brand: Layer = Object.create(null) as Layer;
  const branch: Layer = Object.create(null) as Layer;
  for (const row of rows) {
    if (row.scope_kind === "brand") brand[EINVOICE_PROFILE_KEY] = row.value;
    if (row.scope_kind === "branch") branch[EINVOICE_PROFILE_KEY] = row.value;
  }
  const resolved = resolveConfig(EINVOICE_PROFILE_KEY, { system: configDefaults(), brand, branch });
  const parsed = einvoiceProfileSettingSchema.safeParse(resolved.value);
  if (!parsed.success) return { status: "unreadable", source: resolved.source };
  if (parsed.data === null) return { status: "unset", source: resolved.source };
  return { status: "set", profile: parsed.data, source: resolved.source };
}

/** The profile when the branch invoices its sales now, else null. */
export function enabledProfile(found: BranchEInvoiceProfile | null): EInvoiceProfile | null {
  return found?.status === "set" && found.profile.enabled ? found.profile : null;
}
