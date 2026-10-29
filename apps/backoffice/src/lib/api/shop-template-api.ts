import {
  type ShopTemplatePlanWire,
  type ShopTemplateWire,
  shopTemplateListSchema,
  shopTemplatePlanSchema,
} from "@fnb/contracts";
import { type ApiResult, type FetchLike, requestJson, resultOf } from "./api-result";
import { parsedBy } from "./read-json-fields";

export type ShopTemplate = Readonly<ShopTemplateWire>;
export type ShopTemplatePlan = Readonly<ShopTemplatePlanWire>;

export interface ShopTemplateApi {
  /** `GET /shop-templates`: the kinds of shop the system has a starting point for. */
  listShopTemplates(): Promise<ApiResult<ShopTemplate[]>>;
  /** `GET /shop-templates/:id/plan?branchId=`: what applying it to the branch would add. */
  getShopTemplatePlan(templateId: string, branchId: string): Promise<ApiResult<ShopTemplatePlan>>;
  /** `POST /shop-templates/:id/apply`: adds it, answers what was added (nothing, the second time). */
  applyShopTemplate(templateId: string, branchId: string): Promise<ApiResult<ShopTemplatePlan>>;
}

export function httpShopTemplateApi(base: string, fetchImpl: FetchLike): ShopTemplateApi {
  const url = (path: string) => `${base}/shop-templates${path}`;
  const readPlan = (body: unknown) => parsedBy(shopTemplatePlanSchema, body);
  return {
    async listShopTemplates() {
      const answer = await requestJson(fetchImpl, url(""), { method: "GET" });
      return resultOf(answer, (body) => parsedBy(shopTemplateListSchema, body)?.templates ?? null);
    },
    async getShopTemplatePlan(templateId, branchId) {
      const path = `/${encodeURIComponent(templateId)}/plan?branchId=${encodeURIComponent(branchId)}`;
      return resultOf(await requestJson(fetchImpl, url(path), { method: "GET" }), readPlan);
    },
    async applyShopTemplate(templateId, branchId) {
      const answer = await requestJson(fetchImpl, url(`/${encodeURIComponent(templateId)}/apply`), { method: "POST", body: { branchId } });
      return resultOf(answer, readPlan);
    },
  };
}
