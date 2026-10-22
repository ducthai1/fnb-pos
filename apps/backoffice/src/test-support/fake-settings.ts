import { vi as mock } from "vitest";
import type { ApiResult } from "../lib/api/api-result";
import type { ConfigScopeKind, SettingEntry, SettingsApi, SettingsScope, SettingsView } from "../lib/api/settings-api";
import { BRANCHES, ok } from "./fake-backoffice-api";

const RANK: Readonly<Record<ConfigScopeKind, number>> = { brand: 0, branch: 1, device: 2 };

/** Every key the server's settings view lists: its kind, most specific layer and default. */
const KEYS: readonly (readonly [string, "flag" | "setting", ConfigScopeKind, unknown])[] = [
  ["tables", "flag", "branch", false],
  ["pay_first_counter", "flag", "device", true],
  ["cup_labels", "flag", "device", false],
  ["kitchen_routing", "flag", "branch", false],
  ["course_firing", "flag", "branch", false],
  ["qr_ordering", "flag", "branch", false],
  ["happy_hour_pricing", "flag", "brand", false],
  ["inventory_tracking", "flag", "branch", false],
  ["auto_86_on_zero_stock", "flag", "branch", false],
  ["allow_negative_stock", "flag", "branch", false],
  ["einvoice", "flag", "branch", false],
  ["cash_rounding", "flag", "branch", false],
  ["charge_profile", "setting", "branch", { pricesIncludeTax: true, serviceCharge: null }],
  ["void_after_sent_needs_approval", "setting", "branch", true],
  ["payment_account", "setting", "branch", null],
  ["einvoice_profile", "setting", "branch", null],
  ["shift_close_difference_tolerance", "setting", "device", "0"],
];

export const BRANCH_SCOPE: SettingsScope = { kind: "branch", id: BRANCHES[0]!.id };
export const BRAND_SCOPE: SettingsScope = { kind: "brand", id: BRANCHES[0]!.brandId };

/**
 * The view the server answers for `scope` when that layer stores `own` and the layers
 * above store nothing: the same shape, sources and editability rules as the real one.
 */
export function settingsView(scope: SettingsScope, own: Readonly<Record<string, unknown>> = {}): SettingsView {
  const entries: SettingEntry[] = KEYS.map(([key, kind, mostSpecific, fallback]) => {
    const setHere = Object.hasOwn(own, key);
    return {
      key,
      kind,
      value: setHere ? own[key] : fallback,
      source: setHere ? scope.kind : "system",
      editableHere: RANK[scope.kind] <= RANK[mostSpecific],
      setHere,
    };
  });
  return {
    scope: { kind: scope.kind, id: scope.id },
    layers: { system: Object.fromEntries(KEYS.map(([key, , , fallback]) => [key, fallback])), brand: {} },
    entries,
  };
}

/**
 * The settings routes as a test sees them: each scope stores what was written to it and
 * answers its view; a test replaces one call to make the server refuse it.
 */
export function fakeSettings(initial: Readonly<Record<string, Record<string, unknown>>> = {}) {
  const stored = new Map<string, Record<string, unknown>>(
    Object.entries(initial).map(([id, values]) => [id, { ...values }]),
  );
  const own = (scope: SettingsScope) => stored.get(scope.id) ?? {};
  const answer = (scope: SettingsScope): ApiResult<SettingsView> => ok(settingsView(scope, own(scope)));
  const getSettings = mock.fn(async (scope: SettingsScope) => answer(scope));
  const putSetting = mock.fn(async (scope: SettingsScope, key: string, value: unknown) => {
    stored.set(scope.id, { ...own(scope), [key]: value });
    return answer(scope);
  });
  const clearSetting = mock.fn(async (scope: SettingsScope, key: string) => {
    const rest = { ...own(scope) };
    delete rest[key];
    stored.set(scope.id, rest);
    return answer(scope);
  });
  const putWebhookSecret = mock.fn<SettingsApi["putWebhookSecret"]>(async () => ok(true as const));
  const wallets = new Map<string, { enabled: boolean; saved: boolean }>();
  const getWallets = mock.fn<SettingsApi["getWallets"]>(async () =>
    ok({
      wallets: [{ wallet: "zalopay" as const, ...(wallets.get("zalopay") ?? { enabled: false, saved: false }) }],
    }),
  );
  const putWallet = mock.fn<SettingsApi["putWallet"]>(async (_branchId, wallet, body) => {
    const saved = body.credentials !== undefined || wallets.get(wallet)?.saved === true;
    wallets.set(wallet, { enabled: body.enabled, saved });
    return ok(true as const);
  });
  const api: SettingsApi = { getSettings, putSetting, clearSetting, putWebhookSecret, getWallets, putWallet };
  return { api, getSettings, putSetting, clearSetting, putWebhookSecret, getWallets, putWallet };
}
