import type { FetchLike } from "./api-result";
import { type AuthApi, httpAuthApi } from "./auth-api";
import { type BranchApi, httpBranchApi } from "./branch-api";
import { type CatalogApi, httpCatalogApi } from "./catalog-api";
import { type DayCloseApi, httpDayCloseApi } from "./day-close-api";
import { type DevicesApi, httpDevicesApi } from "./devices-api";
import { type FloorApi, httpFloorApi } from "./floor-api";
import { type PriceListApi, httpPriceListApi } from "./price-list-api";
import { type PaymentsApi, httpPaymentsApi } from "./payments-api";
import { type ProductImageApi, httpProductImageApi } from "./product-image-api";
import { type ReportsApi, httpReportsApi } from "./reports-api";
import { type RolesApi, httpRolesApi } from "./roles-api";
import { type SettingsApi, httpSettingsApi } from "./settings-api";
import { type StaffApi, httpStaffApi } from "./staff-api";

/** Every call the backoffice makes; screens get it from context, so tests hand in a fake. */
export type BackofficeApi = AuthApi &
  BranchApi &
  DevicesApi &
  StaffApi &
  RolesApi &
  CatalogApi &
  PriceListApi &
  ProductImageApi &
  SettingsApi &
  ReportsApi &
  DayCloseApi &
  PaymentsApi &
  FloorApi;

/** The API under the backoffice's own origin (rewritten by Next to wherever it runs). */
export const API_BASE = "/api";

export function httpBackofficeApi(
  base: string = API_BASE,
  fetchImpl: FetchLike = (url, init) => fetch(url, init),
): BackofficeApi {
  const root = base.replace(/\/+$/, "");
  return {
    ...httpAuthApi(root, fetchImpl),
    ...httpBranchApi(root, fetchImpl),
    ...httpDevicesApi(root, fetchImpl),
    ...httpStaffApi(root, fetchImpl),
    ...httpRolesApi(root, fetchImpl),
    ...httpCatalogApi(root, fetchImpl),
    ...httpPriceListApi(root, fetchImpl),
    ...httpProductImageApi(root, fetchImpl),
    ...httpSettingsApi(root, fetchImpl),
    ...httpReportsApi(root, fetchImpl),
    ...httpDayCloseApi(root, fetchImpl),
    ...httpPaymentsApi(root, fetchImpl),
    ...httpFloorApi(root, fetchImpl),
  };
}
