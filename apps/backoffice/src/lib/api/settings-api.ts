import { type ConfigScopeKind, type SettingEntry, type SettingsView, settingsViewSchema } from "@fnb/contracts";
import { type ApiResult, type FetchLike, noContent, requestJson, resultOf } from "./api-result";
import { parsedBy } from "./read-json-fields";

export type { ConfigScopeKind, SettingEntry, SettingsView };

/** The brand, branch or till whose switches and settings a page shows. */
export interface SettingsScope {
  readonly kind: ConfigScopeKind;
  readonly id: string;
}

export interface SettingsApi {
  /** `GET /settings?scope=&scopeId=`: every key as it resolves there, and where it comes from. */
  getSettings(scope: SettingsScope): Promise<ApiResult<SettingsView>>;
  /** `PUT /settings/:scope/:scopeId/:key` `{ value }`: answers the view after the write. */
  putSetting(scope: SettingsScope, key: string, value: unknown): Promise<ApiResult<SettingsView>>;
  /** `DELETE /settings/:scope/:scopeId/:key`: the layer inherits the key again. */
  clearSetting(scope: SettingsScope, key: string): Promise<ApiResult<SettingsView>>;
  /**
   * `PUT /payments/webhook-secrets/:branchId/:gateway` `{ secret }`, answered 204. Write
   * only: no route reads a secret back, so the page never shows one again.
   */
  putWebhookSecret(branchId: string, gateway: string, secret: string): Promise<ApiResult<true>>;
}

const settingUrl = (base: string, scope: SettingsScope, key: string) =>
  `${base}/settings/${scope.kind}/${encodeURIComponent(scope.id)}/${encodeURIComponent(key)}`;

const view = (body: unknown) => parsedBy(settingsViewSchema, body);

export function httpSettingsApi(base: string, fetchImpl: FetchLike): SettingsApi {
  return {
    async getSettings(scope) {
      const query = new URLSearchParams({ scope: scope.kind, scopeId: scope.id });
      const answer = await requestJson(fetchImpl, `${base}/settings?${query}`, { method: "GET" });
      return resultOf(answer, view);
    },
    async putSetting(scope, key, value) {
      const answer = await requestJson(fetchImpl, settingUrl(base, scope, key), {
        method: "PUT",
        body: { value },
      });
      return resultOf(answer, view);
    },
    async clearSetting(scope, key) {
      const answer = await requestJson(fetchImpl, settingUrl(base, scope, key), { method: "DELETE" });
      return resultOf(answer, view);
    },
    async putWebhookSecret(branchId, gateway, secret) {
      const url = `${base}/payments/webhook-secrets/${encodeURIComponent(branchId)}/${encodeURIComponent(gateway)}`;
      return resultOf(await requestJson(fetchImpl, url, { method: "PUT", body: { secret } }), noContent);
    },
  };
}
