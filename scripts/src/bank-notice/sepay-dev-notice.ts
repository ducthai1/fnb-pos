import { z } from "zod";

export interface SepayDevNoticeInput {
  /** The shop the webhook path names (its tenant id). */
  readonly tenantId: string;
  /** The API key the branch set on its SePay webhook. */
  readonly secret: string;
  /** The transfer's description, as the customer's bank sent it: the QR's content code. */
  readonly content: string;
  readonly amount: number;
  readonly at: Date;
  /** SePay's own transaction id, the key it deduplicates retries by. */
  readonly transactionId: number;
}

export interface SepayDevNotice {
  readonly path: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Readonly<Record<string, unknown>>;
}

const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * A transfer notice as SePay sends one for money coming into the account: a JSON POST to
 * the shop's webhook, authenticated with `Authorization: Apikey <key>`, the time written in
 * Vietnam local time without an offset.
 */
export function sepayDevNotice(input: SepayDevNoticeInput): SepayDevNotice {
  const local = new Date(input.at.getTime() + VIETNAM_OFFSET_MS).toISOString();
  return {
    path: `/webhooks/payments/sepay/${input.tenantId}`,
    headers: { authorization: `Apikey ${input.secret}`, "content-type": "application/json" },
    body: {
      id: input.transactionId,
      gateway: "Vietcombank",
      transactionDate: `${local.slice(0, 10)} ${local.slice(11, 19)}`,
      accountNumber: "1234567890",
      content: input.content,
      transferType: "in",
      transferAmount: input.amount,
      referenceCode: `DEV${input.transactionId}`,
      description: input.content,
    },
  };
}

const argumentsSchema = z.tuple([
  z.string().trim().min(1).max(1000),
  z.coerce.number().int().positive().safe(),
]);

/** `<content> <amount>` from the command line, or why they are not usable. */
export function readNoticeArguments(
  args: readonly string[],
): { ok: true; content: string; amount: number } | { ok: false } {
  const parsed = argumentsSchema.safeParse(args);
  return parsed.success
    ? { ok: true, content: parsed.data[0], amount: parsed.data[1] }
    : { ok: false };
}
