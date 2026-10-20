import { type StaffSummary, staffListSchema } from "@fnb/contracts";
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

export interface StaffApi {
  /** `GET /staff` → `{ staff: [{ id, displayName, roleId, active, branchIds }] }`. */
  listStaff(): Promise<ApiResult<StaffMember[]>>;
  createStaff(member: NewStaffMember): Promise<ApiResult<{ staffId: string }>>;
}

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
  };
}
