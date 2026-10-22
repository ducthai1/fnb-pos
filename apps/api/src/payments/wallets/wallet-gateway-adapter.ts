import type { Vnd } from "@fnb/domain";
import type { GatewayNotice } from "../gateways/payment-gateway-adapter";

/** A branch's keys at one wallet, opened from their sealed form for one call. */
export interface WalletCredentials {
  readonly appId: string;
  /** Signs what the server sends the wallet. */
  readonly key1: string;
  /** Proves what the wallet sends the server. */
  readonly key2: string;
}

/** A payment the server asks a wallet to open. The amount is always the server's total. */
export interface WalletPaymentRequest {
  readonly gatewayRef: string;
  readonly amount: Vnd;
  /** What the customer reads on the wallet's confirm screen. */
  readonly description: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  /** Where the wallet's notice goes; null when the server is not reachable from outside. */
  readonly callbackUrl: string | null;
}

export interface OpenedWalletPayment {
  /** What the customer scans with the wallet's app (or the wallet's payment page). */
  readonly qrContent: string;
}

/** A payment the wallet says went through, in the server's terms. */
export interface WalletPaymentReport {
  readonly gatewayRef: string;
  readonly amount: Vnd;
  /** The wallet's own id for the money that moved. */
  readonly gatewayTransactionId: string;
}

/** What the wallet answers when asked about a payment. */
export type WalletPaymentStatus =
  | ({ readonly status: "paid" } & Omit<WalletPaymentReport, "gatewayRef">)
  /** Not paid yet, or the wallet is still processing it. */
  | { readonly status: "pending" }
  /** The wallet will not take money for it any more (failed, cancelled, expired, unknown). */
  | { readonly status: "failed" };

/** Giving the money back through the wallet: not built for any wallet yet. */
export type WalletRefundOutcome = { readonly kind: "not_supported" };

/**
 * One e-wallet (ZaloPay, later MoMo or VNPay): how to open a payment of a fixed amount,
 * prove and read its notice, ask about a payment whose notice never came, and give money
 * back. The wallets are interchangeable: the routes, the settlement and the poller only
 * ever talk to this interface, by the wallet's key.
 */
export interface WalletGatewayAdapter {
  /** The key in the routes, in payment_intent.wallet and in bank_transaction.gateway. */
  readonly wallet: string;
  /** The server's id for a new payment at the wallet, in the wallet's format. */
  gatewayRef(at: Date, unique: string): string;
  /** Throws WalletGatewayError when the wallet refuses or cannot be reached. */
  createPayment(
    credentials: WalletCredentials,
    request: WalletPaymentRequest,
    signal: AbortSignal,
  ): Promise<OpenedWalletPayment>;
  /** The payment a notice claims to be about, before it proved anything; null if unreadable. */
  claimedRef(notice: GatewayNotice): string | null;
  /** The payment a notice reports, or null when the keys do not prove it. */
  verifyNotice(credentials: WalletCredentials, notice: GatewayNotice): WalletPaymentReport | null;
  /** The body the wallet expects back, for a notice taken or refused. */
  noticeAnswer(outcome: "accepted" | "refused"): unknown;
  /** Throws WalletGatewayError when the wallet gives no usable answer. */
  queryStatus(
    credentials: WalletCredentials,
    gatewayRef: string,
    signal: AbortSignal,
  ): Promise<WalletPaymentStatus>;
  refund(): Promise<WalletRefundOutcome>;
}

/** The wallet refused, answered something unreadable, or could not be reached. */
export class WalletGatewayError extends Error {
  constructor(wallet: string, reason: string) {
    super(`${wallet}: ${reason}`);
    this.name = "WalletGatewayError";
  }
}

/** The adapters by key; two of one key are a bug, so they fail at startup. */
export function walletsByKey(
  adapters: readonly WalletGatewayAdapter[],
): ReadonlyMap<string, WalletGatewayAdapter> {
  const byKey = new Map<string, WalletGatewayAdapter>();
  for (const adapter of adapters) {
    if (!/^[a-z][a-z0-9_]{0,31}$/.test(adapter.wallet) || byKey.has(adapter.wallet)) {
      throw new Error(`wallet key unusable or taken: ${adapter.wallet}`);
    }
    byKey.set(adapter.wallet, adapter);
  }
  return byKey;
}
