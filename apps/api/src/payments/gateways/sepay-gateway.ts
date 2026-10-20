import { vnd } from "@fnb/domain";
import { z } from "zod";
import {
  type GatewayNotice,
  type PaymentGatewayAdapter,
  UnreadableNoticeError,
  headerOf,
  sameSecret,
  vietnamLocalTime,
} from "./payment-gateway-adapter";

const noticeSchema = z.object({
  /** SePay's own transaction id: its documentation names it the key against duplicates. */
  id: z.union([z.number().int().positive().safe(), z.string().regex(/^\d{1,20}$/)]),
  transferType: z.enum(["in", "out"]),
  transferAmount: z.number().int().positive().safe(),
  content: z.string().max(1000).nullable(),
  transactionDate: z.string(),
});

/**
 * SePay (docs.sepay.vn): a JSON POST per bank transaction, authenticated by the API key the
 * shop set on the webhook, sent as `Authorization: Apikey <key>`.
 */
export const sepayGateway: PaymentGatewayAdapter = {
  gateway: "sepay",
  verify(notice: GatewayNotice, secret: string) {
    const presented = headerOf(notice, "authorization");
    return presented !== null && sameSecret(presented, `Apikey ${secret}`);
  },
  parse(notice: GatewayNotice) {
    const parsed = noticeSchema.safeParse(notice.body);
    const occurredAt = parsed.success ? vietnamLocalTime(parsed.data.transactionDate) : null;
    if (!parsed.success || occurredAt === null) throw new UnreadableNoticeError("sepay");
    const { id, transferType, transferAmount, content } = parsed.data;
    return {
      referenceCode: String(id),
      amount: vnd(transferAmount),
      content: content ?? "",
      transferType,
      occurredAt,
    };
  },
};
