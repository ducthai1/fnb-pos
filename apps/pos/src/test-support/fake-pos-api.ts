import type { Grant } from "@fnb/domain";
import type { ApiFailure } from "../features/api/api-result";
import type { ApprovalRequest, PosApi } from "../features/api/pos-api";
import { CREDENTIAL } from "./credential";

export const refusal = (
  status: number | null,
  code: string | null,
  body?: unknown,
): ApiFailure => ({
  ok: false,
  status,
  code,
  body: body ?? (code === null ? null : { code }),
});

/** One approval the fake server gave: what was asked, by whom, approved by whom. */
export interface FakeApproval extends ApprovalRequest {
  readonly approvalId: string;
  readonly requestedBy: string;
}

/** What the fake API answers from; tests change it between steps. */
export interface FakeApiState {
  online: boolean;
  pairingCode: string;
  pins: Map<string, string>;
  /** Each staff member's grants, as /pos/staff-sessions/current would send them. None: no key. */
  grants: Map<string, Grant[]>;
  /** Approvers the server would find not allowed the action themselves. */
  notPermittedApprovers: Set<string>;
  /** Staff tokens the server no longer knows (the session ran out). */
  expiredTokens: Set<string>;
  approvals: FakeApproval[];
  calls: {
    pair: { code: string; deviceName: string }[];
    signIn: { staffId: string; pin: string; deviceToken: string }[];
    approvals: (ApprovalRequest & { staffToken: string })[];
  };
}

export const fakeApiState = (): FakeApiState => ({
  online: true,
  pairingCode: "ABCDEFGH",
  pins: new Map(),
  grants: new Map(),
  notPermittedApprovers: new Set(),
  expiredTokens: new Set(),
  approvals: [],
  calls: { pair: [], signIn: [], approvals: [] },
});

const tokenOf = (staffId: string) => `staff-${staffId}`;
const staffOfToken = (token: string) => token.replace(/^staff-/, "");
let approvalCount = 0;

/** The POS's calls outside sync, answered from `state` and recorded in it. */
export function fakePosApi(state: FakeApiState): PosApi {
  const unreachable = () => refusal(null, null);
  return {
    async pairDevice(input) {
      state.calls.pair.push(input);
      if (!state.online) return unreachable();
      if (input.code !== state.pairingCode) return refusal(401, "API_DEVICE_PAIRING_CODE_INVALID");
      return { ok: true, value: CREDENTIAL };
    },
    async startStaffSession(credential, input) {
      state.calls.signIn.push({ ...input, deviceToken: credential.deviceToken });
      if (!state.online) return unreachable();
      if (state.pins.get(input.staffId) !== input.pin) return refusal(401, "API_STAFF_PIN_INVALID");
      const session = { staffId: input.staffId, token: tokenOf(input.staffId) };
      return { ok: true, value: { ...session, expiresAt: "2026-10-20T15:00:00.000Z" } };
    },
    async staffGrants(_credential, staffToken) {
      if (!state.online) return unreachable();
      if (state.expiredTokens.has(staffToken)) return refusal(401, "API_STAFF_SESSION_INVALID");
      return { ok: true, value: state.grants.get(staffOfToken(staffToken)) ?? [] };
    },
    async requestApproval(_credential, staffToken, request) {
      state.calls.approvals.push({ ...request, staffToken });
      if (!state.online) return unreachable();
      if (state.expiredTokens.has(staffToken)) return refusal(401, "API_STAFF_SESSION_INVALID");
      const requestedBy = staffOfToken(staffToken);
      if (request.approverStaffId === requestedBy) {
        return refusal(403, "API_APPROVAL_SELF_APPROVAL");
      }
      if (state.pins.get(request.approverStaffId) !== request.approverPin) {
        return refusal(401, "API_STAFF_PIN_INVALID");
      }
      if (state.notPermittedApprovers.has(request.approverStaffId)) {
        return refusal(403, "API_APPROVAL_APPROVER_NOT_PERMITTED");
      }
      approvalCount += 1;
      const approvalId = `0199f000-0000-7000-a000-${approvalCount.toString(16).padStart(12, "0")}`;
      state.approvals.push({ ...request, approvalId, requestedBy });
      return { ok: true, value: approvalId };
    },
  };
}
