import { type PosBootstrap, posBootstrapSchema } from "@fnb/contracts";
import type { DeviceCredential } from "../../shell-bridge/device-credential-store";
import { type ApiResult, type FetchLike, requestJson, resultOf } from "../api/api-result";
import { deviceAuthorization } from "../api/pos-api";
import type { TillPlace } from "../order/till-command";

/**
 * Everything the till starts selling from (GET /pos/bootstrap), parsed by the contract the
 * server answers with: money arrives as whole đồng and leaves the parse as the domain's
 * amounts, so the menu goes straight into pricing.
 */
export type BootstrapSnapshot = PosBootstrap;
export type BootstrapStaff = PosBootstrap["staff"][number];

export interface BootstrapSource {
  load(credential: DeviceCredential): Promise<ApiResult<BootstrapSnapshot>>;
}

/**
 * The answer, or null when it is not one. The contract is strict, so a field it does not
 * name (a PIN hash, a credential) fails the parse instead of reaching the till's screens.
 */
export function parseBootstrap(body: unknown): BootstrapSnapshot | null {
  const parsed = posBootstrapSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

/** Staff the PIN screen lists: someone switched off in the backoffice cannot sign in. */
export function staffWhoMaySignIn(snapshot: BootstrapSnapshot): readonly BootstrapStaff[] {
  return snapshot.staff.filter((member) => member.active);
}

export function httpBootstrapSource(
  baseUrl: string,
  fetchImpl: FetchLike = (u, i) => fetch(u, i),
): BootstrapSource {
  const base = baseUrl.replace(/\/+$/, "");
  return {
    async load(credential) {
      const answer = await requestJson(fetchImpl, `${base}/pos/bootstrap`, {
        method: "GET",
        headers: deviceAuthorization(credential),
      });
      return resultOf(answer, parseBootstrap);
    },
  };
}

/** Where the till sells, as every command it records is stamped. */
export function tillPlaceOf(snapshot: BootstrapSnapshot): TillPlace {
  return {
    deviceId: snapshot.device.id,
    branchId: snapshot.branch.id,
    utcOffsetMinutes: snapshot.branch.utcOffsetMinutes,
    businessDayStartMinute: snapshot.branch.businessDayStartMinute,
  };
}
