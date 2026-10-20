import { createHash, timingSafeEqual } from "node:crypto";
import type { Vnd } from "@fnb/domain";

/** A gateway's notice as the route received it. */
export interface GatewayNotice {
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly body: unknown;
}

/** A transfer a notice reports, in the server's terms. */
export interface ReportedTransfer {
  /** The gateway's own id for the transfer: a notice delivered again carries the same one. */
  readonly referenceCode: string;
  readonly amount: Vnd;
  readonly content: string;
  readonly transferType: "in" | "out";
  readonly occurredAt: Date;
}

/**
 * One payment gateway (SePay, PayOS…): how its notices prove where they came from, and how
 * to read the transfer in one. `verify` runs first, with each candidate secret of the
 * shop; `parse` runs only on a notice that proved itself. `parse` answers null for a
 * notice that reports no transfer (a test ping, a failed payment) and throws
 * UnreadableNoticeError for one that is not in the gateway's format at all.
 */
export interface PaymentGatewayAdapter {
  /** The key in the webhook path and in bank_transaction.gateway. */
  readonly gateway: string;
  verify(notice: GatewayNotice, secret: string): boolean;
  parse(notice: GatewayNotice): ReportedTransfer | null;
}

export class UnreadableNoticeError extends Error {
  constructor(gateway: string) {
    super(`a ${gateway} notice that is not in its format`);
    this.name = "UnreadableNoticeError";
  }
}

/**
 * Compares two strings in time that does not depend on where they differ, so a forger
 * cannot learn a secret one character at a time. Digests first, as timingSafeEqual needs
 * equal lengths and the lengths themselves should not leak either.
 */
export function sameSecret(presented: string, expected: string): boolean {
  const digest = (text: string) => createHash("sha256").update(text, "utf8").digest();
  return timingSafeEqual(digest(presented), digest(expected));
}

/** A header's single value; a header sent twice is not trusted as either. */
export function headerOf(notice: GatewayNotice, name: string): string | null {
  const value = notice.headers[name.toLowerCase()];
  return typeof value === "string" ? value : null;
}

/**
 * Gateways in Vietnam write transfer times as "YYYY-MM-DD HH:mm:ss" in Vietnam's time,
 * with no offset; read as UTC they would land seven hours off.
 */
export function vietnamLocalTime(text: string): Date | null {
  const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(text);
  if (match === null) return null;
  const at = new Date(`${match[1]}T${match[2]}+07:00`);
  return Number.isNaN(at.getTime()) ? null : at;
}
