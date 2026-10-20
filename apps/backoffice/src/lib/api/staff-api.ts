import { type ApiResult, type FetchLike, requestJson, resultOf } from "./api-result";
import { isRecord, listUnder, textOf } from "./read-json-fields";

/** Someone who signs in at the tills with a PIN, in one role, at one or more branches. */
export interface StaffMember {
  readonly id: string;
  readonly displayName: string;
  readonly roleId: string;
  readonly active: boolean;
  readonly branchIds: readonly string[];
}

export interface NewStaffMember {
  readonly displayName: string;
  readonly roleId: string;
  readonly pin: string;
  readonly branchIds: readonly string[];
}

const readStaffMember = (item: Record<string, unknown>): StaffMember | null => {
  const id = textOf(item, "id");
  const displayName = textOf(item, "displayName");
  const roleId = textOf(item, "roleId");
  const branchIds = readIds(item.branchIds);
  if (id === null || displayName === null || roleId === null || branchIds === null) return null;
  if (typeof item.active !== "boolean") return null;
  return { id, displayName, roleId, active: item.active, branchIds };
};

const readIds = (value: unknown): string[] | null =>
  Array.isArray(value) && value.every((id) => typeof id === "string") ? value : null;

export interface StaffApi {
  /** `GET /staff` → `{ staff: [{ id, displayName, roleId, active, branchIds }] }`. */
  listStaff(): Promise<ApiResult<StaffMember[]>>;
  createStaff(member: NewStaffMember): Promise<ApiResult<{ staffId: string }>>;
}

export function httpStaffApi(base: string, fetchImpl: FetchLike): StaffApi {
  return {
    async listStaff() {
      const answer = await requestJson(fetchImpl, `${base}/staff`, { method: "GET" });
      return resultOf(answer, (body) => listUnder(body, "staff", readStaffMember));
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
