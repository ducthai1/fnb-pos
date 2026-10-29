import type { ClientErrorReport } from "@fnb/contracts";
import type { SendOutcome } from "./client-error-reporter";

/**
 * Posts a batch under the till's credential. 204 is taken; no answer, a server fault, 401
 * (the credential may be restored) or 429 try again at the next flush; anything else is a
 * batch the server will never take, so it is dropped rather than sent forever.
 */
export function httpSendReports(
  apiBase: string,
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
) {
  return async (
    deviceToken: string,
    reports: readonly ClientErrorReport[],
  ): Promise<SendOutcome> => {
    try {
      const response = await fetchImpl(`${apiBase}/client-errors`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Device ${deviceToken}` },
        body: JSON.stringify({ reports }),
      });
      if (response.ok) return "sent";
      const retryable =
        response.status >= 500 || response.status === 401 || response.status === 429;
      return retryable ? "retry" : "drop";
    } catch {
      return "retry";
    }
  };
}
