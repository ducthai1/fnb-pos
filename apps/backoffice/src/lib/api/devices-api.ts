import { type DeviceSummary, deviceListSchema } from "@fnb/contracts";
import { type ApiResult, type FetchLike, noContent, requestJson, resultOf } from "./api-result";
import { isRecord, parsedBy, textOf } from "./read-json-fields";

/** A till paired to a branch; revokedAt is set once it can no longer sign in. */
export type Device = Readonly<DeviceSummary>;

/** A one-time code a till types in to pair itself to the branch, until expiresAt. */
export interface PairingCode {
  readonly code: string;
  readonly branchId: string;
  readonly expiresAt: string;
}

function readPairingCode(body: unknown): PairingCode | null {
  if (!isRecord(body)) return null;
  const code = textOf(body, "code");
  const branchId = textOf(body, "branchId");
  const expiresAt = textOf(body, "expiresAt");
  return code === null || branchId === null || expiresAt === null
    ? null
    : { code, branchId, expiresAt };
}

export interface DevicesApi {
  /** `GET /devices?branchId=` → `{ devices: [{ id, name, branchId, pairedAt, revokedAt }] }`. */
  listDevices(branchId: string): Promise<ApiResult<Device[]>>;
  createPairingCode(branchId: string): Promise<ApiResult<PairingCode>>;
  revokeDevice(deviceId: string): Promise<ApiResult<true>>;
}

export function httpDevicesApi(base: string, fetchImpl: FetchLike): DevicesApi {
  return {
    async listDevices(branchId) {
      const url = `${base}/devices?branchId=${encodeURIComponent(branchId)}`;
      const answer = await requestJson(fetchImpl, url, { method: "GET" });
      return resultOf(answer, (body) => parsedBy(deviceListSchema, body)?.devices ?? null);
    },
    async createPairingCode(branchId) {
      const answer = await requestJson(fetchImpl, `${base}/devices/pairing-codes`, {
        method: "POST",
        body: { branchId },
      });
      return resultOf(answer, readPairingCode);
    },
    async revokeDevice(deviceId) {
      const url = `${base}/devices/${encodeURIComponent(deviceId)}/revoke`;
      return resultOf(await requestJson(fetchImpl, url, { method: "POST" }), noContent);
    },
  };
}
