import type { Grant } from "@fnb/domain";
import type { DeviceCredential } from "../../shell-bridge/device-credential-store";
import { parseStaffGrants } from "../permissions/staff-grants";
import { type ApiResult, type FetchLike, requestJson, resultOf, stringFields } from "./api-result";

export interface StaffSession {
  readonly staffId: string;
  /** Sent with every push, so the server records each command as this staff member's. */
  readonly token: string;
  readonly expiresAt: string;
}

/** What POST /pos/approvals is asked: an action, with its value as the wire carries it. */
export interface ApprovalRequest {
  readonly action: {
    readonly key: string;
    readonly discountRate?: number;
    readonly amount?: string;
    /** A close difference, signed (counted − expected), as a decimal string. */
    readonly difference?: string;
  };
  readonly approverStaffId: string;
  readonly approverPin: string;
}

/**
 * The calls the POS makes outside the sync loop: pairing, signing a staff member in, what
 * they may do, and a manager's approval, which only the server can check (the PIN).
 */
export interface PosApi {
  pairDevice(input: { code: string; deviceName: string }): Promise<ApiResult<DeviceCredential>>;
  startStaffSession(
    credential: DeviceCredential,
    input: { staffId: string; pin: string },
  ): Promise<ApiResult<StaffSession>>;
  staffGrants(credential: DeviceCredential, staffToken: string): Promise<ApiResult<Grant[]>>;
  /** The approval's id, to name in the command it allows. */
  requestApproval(
    credential: DeviceCredential,
    staffToken: string,
    request: ApprovalRequest,
  ): Promise<ApiResult<string>>;
}

/** The header naming the staff member at the till, as the sync push sends it. */
const STAFF_SESSION_HEADER = "x-staff-session";

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
    async staffGrants(credential, staffToken) {
      const answer = await requestJson(fetchImpl, `${base}/pos/staff-sessions/current`, {
        method: "GET",
        headers: { ...deviceAuthorization(credential), [STAFF_SESSION_HEADER]: staffToken },
      });
      return resultOf(answer, parseStaffGrants);
    },
    async requestApproval(credential, staffToken, request) {
      const answer = await requestJson(fetchImpl, `${base}/pos/approvals`, {
        method: "POST",
        headers: { ...deviceAuthorization(credential), [STAFF_SESSION_HEADER]: staffToken },
        body: request,
      });
      return resultOf(answer, (body) => stringFields(body, ["approvalId"])?.approvalId ?? null);
    },
  };
}
