import { FEATURE_FLAG_KEYS, type FeatureFlagKey } from "@fnb/feature-flags";
import { newId } from "@fnb/db";
import { type ShopSetup, type ShopTemplate, type TemplatePlan, planTemplate } from "@fnb/shop-templates";
import type pg from "pg";
import { recordCategoryChange, recordStationChange } from "../catalog/catalog-change-feed";
import { CatalogRequestError } from "../catalog/catalog-request-error";
import { type CatalogWriteContext, insertCatalogRow } from "../catalog/catalog-row-writes";
import { saveConfigValue } from "../configuration/config-value-writes";
import { flagViolationUnder } from "../configuration/flag-rules-under-scope";
import { readScopeConfig } from "../configuration/read-scope-config";
import { lockTenantChangeFeed } from "../sync/change-feed";
import { SHOP_TEMPLATE_ERROR_CODES } from "./shop-template-error-codes";

/** Menu entries are spaced so one can later be moved between two without renumbering. */
const SORT_STEP = 10;

/**
 * The branch as a template sees it: the brand's categories, the branch's stations and the
 * switches someone chose on the brand or on this branch (the branch's own choice wins).
 * Null when the branch is not in this tenant: another tenant's rows read as missing.
 */
export async function readShopSetup(
  client: pg.PoolClient,
  branchId: string,
): Promise<{ brandId: string; setup: ShopSetup } | null> {
  const scope = await readScopeConfig(client, "branch", branchId);
  if (scope === null) return null;
  const categories = await client.query<{ name: string }>("SELECT name FROM category WHERE brand_id = $1", [scope.brandId]);
  const stations = await client.query<{ name: string }>("SELECT name FROM station WHERE branch_id = $1", [branchId]);
  const flagsSetByShop: Partial<Record<FeatureFlagKey, boolean>> = {};
  for (const key of FEATURE_FLAG_KEYS) {
    const value = scope.layers.branch?.[key] ?? scope.layers.brand[key];
    if (typeof value === "boolean") flagsSetByShop[key] = value;
  }
  return {
    brandId: scope.brandId,
    setup: { categoryNames: categories.rows.map((row) => row.name), stationNames: stations.rows.map((row) => row.name), flagsSetByShop },
  };
}

/** What `template` would add to the branch right now; null when the branch is not here. */
export async function previewShopTemplate(client: pg.PoolClient, template: ShopTemplate, branchId: string): Promise<TemplatePlan | null> {
  const found = await readShopSetup(client, branchId);
  return found === null ? null : planTemplate(template, found.setup);
}

/**
 * Adds what the template is missing to the branch, in the caller's transaction: categories
 * on the brand's menu, stations on the branch, switches on the branch's own layer, each
 * announced to the tills as any other write of it is. The plan is made after the tenant's
 * feed lock is taken, so two applies cannot both see a name missing and add it twice. A
 * second apply finds nothing to add. Returns what was added.
 */
export async function applyShopTemplate(
  client: pg.PoolClient,
  writer: CatalogWriteContext,
  template: ShopTemplate,
  branchId: string,
): Promise<TemplatePlan | null> {
  await lockTenantChangeFeed(client, writer.tenantId);
  const found = await readShopSetup(client, branchId);
  if (found === null) return null;
  const plan = planTemplate(template, found.setup);
  let nextSort =
    Number((await client.query<{ top: number | null }>("SELECT MAX(sort_order) AS top FROM category WHERE brand_id = $1", [found.brandId])).rows[0]?.top ?? 0) + SORT_STEP;
  for (const change of plan.changes) {
    if (change.kind === "add_category") {
      const id = newId();
      await insertCatalogRow(client, "category", writer, { id, brand_id: found.brandId, name: change.name, sort_order: nextSort });
      nextSort += SORT_STEP;
      await recordCategoryChange(client, writer.tenantId, found.brandId, id);
    } else if (change.kind === "add_station") {
      const id = newId();
      await insertCatalogRow(client, "station", writer, { id, branch_id: branchId, name: change.name });
      await recordStationChange(client, writer.tenantId, branchId, id);
    } else {
      await saveConfigValue(client, writer, { scopeKind: "branch", scopeId: branchId }, change.flag, change.value);
    }
  }
  if (plan.changes.some((change) => change.kind === "set_flag")) {
    const after = await readScopeConfig(client, "branch", branchId);
    if (after !== null && (await flagViolationUnder(client, after)) !== null) {
      throw new CatalogRequestError(409, SHOP_TEMPLATE_ERROR_CODES.flagRuleBroken);
    }
  }
  return plan;
}

