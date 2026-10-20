import { createHmac } from "node:crypto";
import { vnd } from "@fnb/domain";
import { z } from "zod";
import {
  type GatewayNotice,
  type PaymentGatewayAdapter,
  UnreadableNoticeError,
  sameSecret,
  vietnamLocalTime,
} from "./payment-gateway-adapter";

const signedSchema = z.object({ data: z.record(z.string(), z.unknown()), signature: z.string() });

const noticeSchema = z.object({
  code: z.string(),
  data: z.object({
    amount: z.number().int().positive().safe(),
    description: z.string().max(1000),
    /** The bank's reference of the transfer, one per transfer. */
    reference: z.string().min(1).max(100),
    transactionDateTime: z.string(),
    code: z.string(),
  }),
});

const sortedByKey = (value: unknown): unknown => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(entries);
};

/**
 * The text PayOS signs: the `data` fields sorted by key, as key=value joined by &, with
 * null, undefined and their spellings as text written as nothing, and arrays as JSON of
 * key-sorted items. Written to match payOS's published sample, value for value.
 */
export function payosSignedText(data: Readonly<Record<string, unknown>>): string {
  return Object.keys(data)
    .sort()
    .filter((key) => data[key] !== undefined)
    .map((key) => {
      let value = data[key];
      if (Array.isArray(value)) value = JSON.stringify(value.map(sortedByKey));
      if (value === null || value === "null" || value === "undefined") value = "";
      return `${key}=${String(value)}`;
    })
    .join("&");
}

/**
 * PayOS (payos.vn): a JSON POST whose `data` is signed with the channel's checksum key,
 * HMAC-SHA256 in lowercase hex. Only a notice with code "00" reports money received.
 */
export const payosGateway: PaymentGatewayAdapter = {
  gateway: "payos",
  verify(notice: GatewayNotice, secret: string) {
    const signed = signedSchema.safeParse(notice.body);
    if (!signed.success) return false;
    const expected = createHmac("sha256", secret)
      .update(payosSignedText(signed.data.data), "utf8")
      .digest("hex");
    return sameSecret(signed.data.signature.toLowerCase(), expected);
  },
  parse(notice: GatewayNotice) {
    const parsed = noticeSchema.safeParse(notice.body);
    const occurredAt = parsed.success
      ? vietnamLocalTime(parsed.data.data.transactionDateTime)
      : null;
    if (!parsed.success || occurredAt === null) throw new UnreadableNoticeError("payos");
    const { code, data } = parsed.data;
    if (code !== "00" || data.code !== "00") return null;
    return {
      referenceCode: data.reference,
      amount: vnd(data.amount),
      content: data.description,
      transferType: "in",
      occurredAt,
    };
  },
};
