import { vnd } from "@fnb/domain";
import {
  type GatewayNotice,
  type PaymentGatewayAdapter,
  UnreadableNoticeError,
  headerOf,
  sameSecret,
} from "../../../src/payments/gateways/payment-gateway-adapter";

/** A notice as the fake gateway sends it. */
export interface FakeNotice {
  reference: string;
  amount: number;
  content: string;
  transferType?: "in" | "out";
  occurredAt?: string;
}

/**
 * A gateway for tests: proves a notice by the secret in `x-fake-secret`, and records each
 * notice it was asked to read, so a test can tell what reached the gateway's code.
 */
export function fakePaymentGateway(): PaymentGatewayAdapter & { parsed: unknown[] } {
  const parsed: unknown[] = [];
  return {
    gateway: "fake",
    parsed,
    verify(notice: GatewayNotice, secret: string) {
      const presented = headerOf(notice, "x-fake-secret");
      return presented !== null && sameSecret(presented, secret);
    },
    parse(notice: GatewayNotice) {
      parsed.push(notice.body);
      const body = notice.body as Partial<FakeNotice> | null;
      if (typeof body?.reference !== "string" || typeof body.amount !== "number") {
        throw new UnreadableNoticeError("fake");
      }
      return {
        referenceCode: body.reference,
        amount: vnd(body.amount),
        content: body.content ?? "",
        transferType: body.transferType ?? "in",
        occurredAt: new Date(body.occurredAt ?? "2026-10-20T03:01:00.000Z"),
      };
    },
  };
}
