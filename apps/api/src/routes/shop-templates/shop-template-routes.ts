import {
  type ShopTemplatePlanWire,
  type ShopTemplateWire,
  shopTemplateApplyBodySchema,
  shopTemplateParamsSchema,
  shopTemplatePlanQuerySchema,
} from "@fnb/contracts";
import { withTenant } from "@fnb/db";
import { SHOP_TEMPLATES, type ShopTemplate, type TemplatePlan, shopTemplateById } from "@fnb/shop-templates";
import type { FastifyInstance } from "fastify";
import type { ApiContext } from "../../api-context";
import { backofficeAuth } from "../../auth/backoffice-session-hook";
import { CATALOG_API_ERROR_CODES } from "../../catalog/catalog-api-error-codes";
import { CatalogRequestError, parseOrReject } from "../../catalog/catalog-request-error";
import { SHOP_TEMPLATE_ERROR_CODES } from "../../shop-templates/shop-template-error-codes";
import { applyShopTemplate, previewShopTemplate } from "../../shop-templates/shop-template-store";
import { catalogHandler, writeContextOf } from "../catalog/catalog-route-handler";

const wireOf = (template: ShopTemplate): ShopTemplateWire => ({
  id: template.id,
  name: template.name,
  description: template.description,
  categories: [...template.categories],
  stations: [...template.stations],
  flags: Object.fromEntries(Object.entries(template.flags)) as Record<string, boolean>,
});

const planWire = (template: ShopTemplate, branchId: string, plan: TemplatePlan): ShopTemplatePlanWire => ({
  templateId: template.id,
  branchId,
  changes: plan.changes.map((change) => ({ ...change })),
  kept: plan.kept.map((kept) => ({ ...kept })),
});

function templateOf(params: unknown): ShopTemplate {
  const { templateId } = parseOrReject(shopTemplateParamsSchema, params);
  const template = shopTemplateById(templateId);
  if (template === undefined) throw new CatalogRequestError(404, SHOP_TEMPLATE_ERROR_CODES.templateNotFound);
  return template;
}

/**
 * Starting points by kind of shop. Applying one adds categories and stations to the menu
 * and sets switches, so it takes both keys that guard those: edit_menu for what it adds
 * to the menu, manage_settings for the switches. Either alone is refused, and refused
 * before anything is read, so a refusal says nothing about the branch.
 */
export function registerShopTemplateRoutes(app: FastifyInstance, context: ApiContext): void {
  const guard = {
    onRequest: [context.requireSession, context.requirePermission("manage_settings"), context.requirePermission("edit_menu")],
  };

  app.get("/shop-templates", guard, async () => ({ templates: SHOP_TEMPLATES.map(wireOf) }));

  app.get(
    "/shop-templates/:templateId/plan",
    guard,
    catalogHandler(async (request, reply) => {
      const template = templateOf(request.params);
      const { branchId } = parseOrReject(shopTemplatePlanQuerySchema, request.query);
      const plan = await withTenant(context.pool, backofficeAuth(request).tenantId, (client) => previewShopTemplate(client, template, branchId));
      if (plan === null) throw new CatalogRequestError(404, CATALOG_API_ERROR_CODES.branchNotFound);
      return reply.send(planWire(template, branchId, plan));
    }),
  );

  app.post(
    "/shop-templates/:templateId/apply",
    guard,
    catalogHandler(async (request, reply) => {
      const template = templateOf(request.params);
      const { branchId } = parseOrReject(shopTemplateApplyBodySchema, request.body);
      const writer = writeContextOf(request, context);
      const plan = await withTenant(context.pool, writer.tenantId, (client) => applyShopTemplate(client, writer, template, branchId));
      if (plan === null) throw new CatalogRequestError(404, CATALOG_API_ERROR_CODES.branchNotFound);
      return reply.send(planWire(template, branchId, plan));
    }),
  );
}
