import { type ApiResult, type FetchLike, requestJson, resultOf } from "./api-result";
import { listUnder, textOf } from "./read-json-fields";

/** A branch the signed-in member can look at, with the brand whose menu it sells. */
export interface Branch {
  readonly id: string;
  readonly name: string;
  readonly brandId: string;
  readonly brandName: string;
}

const readBranch = (item: Record<string, unknown>): Branch | null => {
  const id = textOf(item, "id");
  const name = textOf(item, "name");
  const brandId = textOf(item, "brandId");
  const brandName = textOf(item, "brandName");
  if (id === null || name === null || brandId === null || brandName === null) return null;
  return { id, name, brandId, brandName };
};

export interface BranchApi {
  /** `GET /branches` → `{ branches: [{ id, name, brandId, brandName }] }`. */
  listBranches(): Promise<ApiResult<Branch[]>>;
}

export function httpBranchApi(base: string, fetchImpl: FetchLike): BranchApi {
  return {
    async listBranches() {
      const answer = await requestJson(fetchImpl, `${base}/branches`, { method: "GET" });
      return resultOf(answer, (body) => listUnder(body, "branches", readBranch));
    },
  };
}
