import { type BranchSummary, branchListSchema } from "@fnb/contracts";
import { type ApiResult, type FetchLike, requestJson, resultOf } from "./api-result";
import { parsedBy } from "./read-json-fields";

/** A branch the signed-in member can look at, with the brand whose menu it sells. */
export type Branch = Readonly<BranchSummary>;

export interface BranchApi {
  /** `GET /branches` → `{ branches: [{ id, name, brandId, brandName }] }`. */
  listBranches(): Promise<ApiResult<Branch[]>>;
}

export function httpBranchApi(base: string, fetchImpl: FetchLike): BranchApi {
  return {
    async listBranches() {
      const answer = await requestJson(fetchImpl, `${base}/branches`, { method: "GET" });
      return resultOf(answer, (body) => parsedBy(branchListSchema, body)?.branches ?? null);
    },
  };
}
