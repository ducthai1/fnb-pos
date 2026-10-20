import { newId, withTenant } from "@fnb/db";
import type pg from "pg";
import { saveConfigValue } from "../../../src/configuration/config-value-writes";

/** A cash register profile issuing through the fake provider, as a test shop's branch has it. */
export const EINVOICE_PROFILE = {
  enabled: true,
  sellerTaxCode: "0312345678",
  sellerName: "Công ty TNHH Phở Sáng",
  sellerAddress: "12 Lê Lợi, Bến Nghé, Quận 1, TP.HCM",
  templateSymbol: "1C26MAA",
  provider: "fake",
  regimeVersion: "nd254-tt91",
  refundInvoicing: "none",
} as const;

type Scope = { scopeKind: "branch" | "brand" | "device"; scopeId: string };

/** Stores one setting at `scope`, as the backoffice would. */
export function saveSetting(
  pool: pg.Pool,
  tenantId: string,
  scope: Scope,
  key: string,
  value: unknown,
) {
  return withTenant(pool, tenantId, (client) =>
    saveConfigValue(client, { tenantId, appUserId: newId(), now: new Date() }, scope, key, value),
  );
}

/** Stores `value` as the branch's (or brand's) einvoice_profile. */
export const saveEInvoiceProfile = (
  pool: pg.Pool,
  tenantId: string,
  scope: Scope,
  value: unknown = EINVOICE_PROFILE,
) => saveSetting(pool, tenantId, scope, "einvoice_profile", value);
