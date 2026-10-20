import {
  type PaymentIntentSnapshot,
  type UnmatchedPayments,
  type UnmatchedTransfer,
  paymentIntentSnapshotSchema,
  unmatchedPaymentsSchema,
} from "@fnb/contracts";
import { type ApiResult, type FetchLike, requestJson, resultOf } from "./api-result";
import { isRecord, parsedBy } from "./read-json-fields";

export type { PaymentIntentSnapshot, UnmatchedPayments, UnmatchedTransfer };

export interface PaymentsApi {
  /**
   * `GET /payments/unmatched?branchId=`: transfers no QR claimed, QRs still waiting for
   * money, and money the bank brought that no order uses (owed back to the customer).
   */
  listUnmatched(branchId: string): Promise<ApiResult<UnmatchedPayments>>;
  /** `POST /payments/match` `{ transactionId, intentId }`: answers the intent as settled by it. */
  matchTransfer(transactionId: string, intentId: string): Promise<ApiResult<PaymentIntentSnapshot>>;
}

export function httpPaymentsApi(base: string, fetchImpl: FetchLike): PaymentsApi {
  return {
    async listUnmatched(branchId) {
      const query = new URLSearchParams({ branchId });
      const answer = await requestJson(fetchImpl, `${base}/payments/unmatched?${query}`, { method: "GET" });
      return resultOf(answer, (body) => parsedBy(unmatchedPaymentsSchema, body));
    },
    async matchTransfer(transactionId, intentId) {
      const answer = await requestJson(fetchImpl, `${base}/payments/match`, {
        method: "POST",
        body: { transactionId, intentId },
      });
      return resultOf(answer, (body) =>
        isRecord(body) ? parsedBy(paymentIntentSnapshotSchema, body.intent) : null,
      );
    },
  };
}
