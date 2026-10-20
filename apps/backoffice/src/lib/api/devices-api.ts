import { type ApiResult, type FetchLike, noContent, requestJson, resultOf } from "./api-result";
import { isRecord, listUnder, nullableTextOf, textOf } from "./read-json-fields";

/** A till paired to a branch; revokedAt is set once it can no longer sign in. */
export interface Device {
  readonly id: string;
  readonly name: string;
  readonly branchId: string;
  readonly pairedAt: string;
  readonly revokedAt: string | null;
}

/** A one-time code a till types in to pair itself to the branch, until expiresAt. */
export interface PairingCode {
  readonly code: string;
  readonly branchId: string;
  readonly expiresAt: string;
}

const readDevice = (item: Record<string, unknown>): Device | null => {
  const id = textOf(item, "id");
  const name = textOf(item, "name");
  const branchId = textOf(item, "branchId");
  const pairedAt = textOf(item, "pairedAt");
  const revokedAt = nullableTextOf(item, "revokedAt");
  if (id === null || name === null || branchId === null || pairedAt === null) return null;
  if (revokedAt === undefined) return null;
  return { id, name, branchId, pairedAt, revokedAt };
};

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
      return resultOf(answer, (body) => listUnder(body, "devices", readDevice));
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
