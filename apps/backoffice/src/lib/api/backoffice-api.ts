import type { FetchLike } from "./api-result";
import { type AuthApi, httpAuthApi } from "./auth-api";
import { type BranchApi, httpBranchApi } from "./branch-api";

/** Every call the backoffice makes; screens get it from context, so tests hand in a fake. */
export type BackofficeApi = AuthApi & BranchApi;

/** The API under the backoffice's own origin (rewritten by Next to wherever it runs). */
export const API_BASE = "/api";

export function httpBackofficeApi(
  base: string = API_BASE,
  fetchImpl: FetchLike = (url, init) => fetch(url, init),
): BackofficeApi {
  const root = base.replace(/\/+$/, "");
  return {
    ...httpAuthApi(root, fetchImpl),
    ...httpBranchApi(root, fetchImpl),
  };
}
