import type { DeviceCredential } from "../../shell-bridge/device-credential-store";
import { type ApiResult, type FetchLike, requestJson, resultOf, stringFields } from "./api-result";

export interface StaffSession {
  readonly staffId: string;
  /** Sent with every push, so the server records each command as this staff member's. */
  readonly token: string;
  readonly expiresAt: string;
}

/** The calls the POS makes outside the sync loop: pairing and signing a staff member in. */
export interface PosApi {
  pairDevice(input: { code: string; deviceName: string }): Promise<ApiResult<DeviceCredential>>;
  startStaffSession(
    credential: DeviceCredential,
    input: { staffId: string; pin: string },
  ): Promise<ApiResult<StaffSession>>;
}

export const deviceAuthorization = (credential: DeviceCredential) => ({
  authorization: `Device ${credential.deviceToken}`,
});

export function httpPosApi(baseUrl: string, fetchImpl: FetchLike = (u, i) => fetch(u, i)): PosApi {
  const base = baseUrl.replace(/\/+$/, "");
  return {
    async pairDevice(input) {
      const answer = await requestJson(fetchImpl, `${base}/devices/pair`, {
        method: "POST",
        body: input,
      });
      return resultOf(answer, (body) =>
        stringFields(body, ["deviceId", "branchId", "deviceToken"]),
      );
    },
    async startStaffSession(credential, input) {
      const answer = await requestJson(fetchImpl, `${base}/pos/staff-sessions`, {
        method: "POST",
        headers: deviceAuthorization(credential),
        body: input,
      });
      return resultOf(answer, (body) => {
        const fields = stringFields(body, ["staffSessionToken", "staffId", "expiresAt"]);
        return fields === null
          ? null
          : {
              staffId: fields.staffId,
              token: fields.staffSessionToken,
              expiresAt: fields.expiresAt,
            };
      });
    },
  };
}
