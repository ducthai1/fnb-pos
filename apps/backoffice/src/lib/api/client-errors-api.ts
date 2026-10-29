import type { ClientErrorReport } from "@fnb/contracts";
import { type ApiResult, type FetchLike, noContent, requestJson, resultOf } from "./api-result";

export interface ClientErrorsApi {
  /** `POST /client-errors` → 204: the faults this page hit, a batch of 1–20 at a time. */
  reportClientErrors(reports: readonly ClientErrorReport[]): Promise<ApiResult<true>>;
}

export function httpClientErrorsApi(base: string, fetchImpl: FetchLike): ClientErrorsApi {
  return {
    async reportClientErrors(reports) {
      const answer = await requestJson(fetchImpl, `${base}/client-errors`, {
        method: "POST",
        body: { reports },
      });
      return resultOf(answer, noContent);
    },
  };
}
