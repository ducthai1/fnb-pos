import { type StaffSummary, type StaffUpdateBody, staffListSchema } from "@fnb/contracts";
import { type ApiResult, type FetchLike, requestJson, resultOf } from "./api-result";
import { isRecord, parsedBy, textOf } from "./read-json-fields";

/** Someone who signs in at the tills with a PIN, in one role, at one or more branches. */
export type StaffMember = Readonly<Omit<StaffSummary, "branchIds">> & {
  readonly branchIds: readonly string[];
};

export interface NewStaffMember {
  readonly displayName: string;
  readonly roleId: string;
  readonly pin: string;
  readonly branchIds: readonly string[];
}

export type { StaffUpdateBody };

export interface StaffApi {
  /** `GET /staff` → `{ staff: [{ id, displayName, roleId, active, branchIds, lockedOutUntil, failedSignIns, version }] }`. */
  listStaff(): Promise<ApiResult<StaffMember[]>>;
  createStaff(member: NewStaffMember): Promise<ApiResult<{ staffId: string }>>;
  /** `PATCH /staff/:id?version=` of the member last read, `{ displayName?, roleId? }` → 204; 409 when they changed since. */
  updateStaff(staffId: string, version: number, body: StaffUpdateBody): Promise<ApiResult<true>>;
  /** `POST /staff/:id/deactivate` → 204: their shift ends and the tills refuse them. */
  deactivateStaff(staffId: string): Promise<ApiResult<true>>;
  /** `POST /staff/:id/reactivate` → 204. */
  reactivateStaff(staffId: string): Promise<ApiResult<true>>;
  /** `PUT /staff/:id/pin` `{ pin }` → 204. */
  resetStaffPin(staffId: string, pin: string): Promise<ApiResult<true>>;
  /** `POST /staff/:id/pin-unlock` → 204. */
  unlockStaffPin(staffId: string): Promise<ApiResult<true>>;
}

const done = () => true as const;

export function httpStaffApi(base: string, fetchImpl: FetchLike): StaffApi {
  return {
    async listStaff() {
      const answer = await requestJson(fetchImpl, `${base}/staff`, { method: "GET" });
      return resultOf(answer, (body) => parsedBy(staffListSchema, body)?.staff ?? null);
    },
    async createStaff(member) {
      const answer = await requestJson(fetchImpl, `${base}/staff`, {
        method: "POST",
        body: member,
      });
      return resultOf(answer, (body) => {
        const staffId = isRecord(body) ? textOf(body, "staffId") : null;
        return staffId === null ? null : { staffId };
      });
    },
    async updateStaff(staffId, version, body) {
      const url = `${base}/staff/${encodeURIComponent(staffId)}?version=${version}`;
      return resultOf(await requestJson(fetchImpl, url, { method: "PATCH", body }), done);
    },
    async deactivateStaff(staffId) {
      const url = `${base}/staff/${encodeURIComponent(staffId)}/deactivate`;
      return resultOf(await requestJson(fetchImpl, url, { method: "POST" }), done);
    },
    async reactivateStaff(staffId) {
      const url = `${base}/staff/${encodeURIComponent(staffId)}/reactivate`;
      return resultOf(await requestJson(fetchImpl, url, { method: "POST" }), done);
    },
    async resetStaffPin(staffId, pin) {
      const url = `${base}/staff/${encodeURIComponent(staffId)}/pin`;
      return resultOf(await requestJson(fetchImpl, url, { method: "PUT", body: { pin } }), done);
    },
    async unlockStaffPin(staffId) {
      const url = `${base}/staff/${encodeURIComponent(staffId)}/pin-unlock`;
      return resultOf(await requestJson(fetchImpl, url, { method: "POST" }), done);
    },
  };
}
