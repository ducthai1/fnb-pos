import { PERMISSION_KEYS } from "@fnb/domain";
import type { ApiFailure, ApiResult } from "../lib/api/api-result";
import type { BackofficeApi } from "../lib/api/backoffice-api";
import type { Branch } from "../lib/api/branch-api";

export const ok = <T>(value: T): ApiResult<T> => ({ ok: true, value });

export const refused = (status: number | null, code: string | null = null): ApiFailure => ({
  ok: false,
  status,
  code,
  body: code === null ? null : { code },
});

export const OWNER = {
  accountId: "0190a000-0000-7000-8000-000000000001",
  organizationId: "0190a000-0000-7000-8000-000000000002",
  organizationName: "Công ty Trà Sáng",
  appUserId: "0190a000-0000-7000-8000-000000000003",
  displayName: "Chủ quán",
  permissionKeys: PERMISSION_KEYS,
} as const;

export const BRANCHES: readonly Branch[] = [
  { id: "0190a000-0000-7000-8000-0000000000b1", name: "Q1", brandId: "0190a000-0000-7000-8000-0000000000a1", brandName: "Trà Sáng" },
  { id: "0190a000-0000-7000-8000-0000000000b2", name: "Q3", brandId: "0190a000-0000-7000-8000-0000000000a1", brandName: "Trà Sáng" },
];

const unexpected = (name: string) => async (): Promise<never> => {
  throw new Error(`the test did not expect a call to ${name}`);
};

/**
 * The API as a screen test sees it: a signed-in owner with two branches, and every other
 * call failing the test until the test says how it answers.
 */
export function fakeBackofficeApi(overrides: Partial<BackofficeApi> = {}): BackofficeApi {
  const base: BackofficeApi = {
    login: unexpected("login"),
    logout: async () => ok(true),
    me: async () => ok({ ...OWNER }),
    listBranches: async () => ok([...BRANCHES]),
    listDevices: unexpected("listDevices"),
    createPairingCode: unexpected("createPairingCode"),
    revokeDevice: unexpected("revokeDevice"),
    listStaff: unexpected("listStaff"),
    createStaff: unexpected("createStaff"),
    updateStaff: unexpected("updateStaff"),
    deactivateStaff: unexpected("deactivateStaff"),
    reactivateStaff: unexpected("reactivateStaff"),
    resetStaffPin: unexpected("resetStaffPin"),
    unlockStaffPin: unexpected("unlockStaffPin"),
    listRoles: unexpected("listRoles"),
    createRole: unexpected("createRole"),
    updateRole: unexpected("updateRole"),
    archiveRole: unexpected("archiveRole"),
    listCategories: unexpected("listCategories"),
    putCategory: unexpected("putCategory"),
    deleteCategory: unexpected("deleteCategory"),
    listStations: unexpected("listStations"),
    putStation: unexpected("putStation"),
    deleteStation: unexpected("deleteStation"),
    uploadProductImage: unexpected("uploadProductImage"),
    listPriceLists: unexpected("listPriceLists"),
    getPriceList: unexpected("getPriceList"),
    putPriceList: unexpected("putPriceList"),
    deletePriceList: unexpected("deletePriceList"),
    listProducts: unexpected("listProducts"),
    getProduct: unexpected("getProduct"),
    putProduct: unexpected("putProduct"),
    archiveProduct: unexpected("archiveProduct"),
    listSoldOut: unexpected("listSoldOut"),
    setAvailable: unexpected("setAvailable"),
    listShopTemplates: unexpected("listShopTemplates"),
    getShopTemplatePlan: unexpected("getShopTemplatePlan"),
    applyShopTemplate: unexpected("applyShopTemplate"),
    getSettings: unexpected("getSettings"),
    putSetting: unexpected("putSetting"),
    clearSetting: unexpected("clearSetting"),
    putWebhookSecret: unexpected("putWebhookSecret"),
    getWallets: unexpected("getWallets"),
    putWallet: unexpected("putWallet"),
    getDailySales: unexpected("getDailySales"),
    getPrintFailures: unexpected("getPrintFailures"),
    getDayStatus: unexpected("getDayStatus"),
    closeDay: unexpected("closeDay"),
    listUnmatched: unexpected("listUnmatched"),
    matchTransfer: unexpected("matchTransfer"),
    handBackQrMoney: unexpected("handBackQrMoney"),
    listAreas: unexpected("listAreas"),
    listTables: unexpected("listTables"),
    putArea: unexpected("putArea"),
    putTable: unexpected("putTable"),
    removeArea: unexpected("removeArea"),
    removeTable: unexpected("removeTable"),
  };
  return { ...base, ...overrides };
}
