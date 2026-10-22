import { vnd } from "@fnb/domain";
import { type GatewayNotice, sameSecret } from "../gateways/payment-gateway-adapter";
import {
  type WalletGatewayAdapter,
  WalletGatewayError,
  type WalletPaymentReport,
} from "./wallet-gateway-adapter";
import { callbackMac, createOrderMac, queryOrderMac } from "./zalopay-signatures";

export type WalletFetch = (url: string, init: RequestInit) => Promise<Response>;

/** ZaloPay's v2 API hosts: the sandbox for test apps, production for a shop's real app. */
export const ZALOPAY_ENDPOINTS = {
  sandbox: "https://sb-openapi.zalopay.vn",
  production: "https://openapi.zalopay.vn",
} as const;

export type ZaloPayEnvironment = keyof typeof ZALOPAY_ENDPOINTS;

const WALLET = "zalopay";
/** Who pays, as ZaloPay's app_user: the till never knows the customer, so one name for all. */
const APP_USER = "fnb_pos";
/** ZaloPay takes an order's life from 300 seconds up; ours is the intent's, to the second. */
const MIN_LIFETIME_SECONDS = 300;

/** yymmdd in Vietnam's time (UTC+7), which ZaloPay requires an app_trans_id to start with. */
function vietnamDateCode(at: Date): string {
  const local = new Date(at.getTime() + 7 * 60 * 60_000);
  const yy = String(local.getUTCFullYear() % 100).padStart(2, "0");
  const mm = String(local.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(local.getUTCDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

const wholeNumber = (value: unknown): bigint | null =>
  typeof value === "number" && Number.isSafeInteger(value)
    ? BigInt(value)
    : typeof value === "string" && /^[0-9]{1,18}$/.test(value)
      ? BigInt(value)
      : null;

const textOf = (value: unknown): string | null =>
  typeof value === "string" && value !== "" ? value : null;

/** The callback's `data` and `mac`, from a JSON body (what ZaloPay sends) or a form body. */
function callbackParts(notice: GatewayNotice): { data: string; mac: string } | null {
  let body = notice.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return null;
    }
  }
  if (typeof body !== "object" || body === null) return null;
  const { data, mac } = body as { data?: unknown; mac?: unknown };
  return typeof data === "string" && typeof mac === "string" ? { data, mac } : null;
}

function parseData(data: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(data);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * ZaloPay's v2 API, as its official SDK and samples write it: create order and query order
 * are form posts signed with key1, the callback's `data` is checked with key2, and
 * every answer is JSON with a return_code (1 success, 2 failed, 3 still processing).
 * Refunds are not built yet: money a wallet brought that no sale counts goes back by hand.
 */
export function zaloPayWallet(options: {
  environment: ZaloPayEnvironment;
  fetch?: WalletFetch;
  /** Overrides the host, for a local stand-in of ZaloPay in tests. */
  endpoint?: string;
}): WalletGatewayAdapter {
  const base = options.endpoint ?? ZALOPAY_ENDPOINTS[options.environment];
  const send = options.fetch ?? ((url, init) => fetch(url, init));

  async function post(path: string, form: Record<string, string>, signal: AbortSignal) {
    let response: Response;
    try {
      response = await send(`${base}${path}`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(form).toString(),
        signal,
      });
    } catch {
      throw new WalletGatewayError(WALLET, `${path} unreachable`);
    }
    if (!response.ok) throw new WalletGatewayError(WALLET, `${path} answered ${response.status}`);
    try {
      const body: unknown = await response.json();
      if (typeof body !== "object" || body === null) throw new Error("not an object");
      return body as Record<string, unknown>;
    } catch {
      throw new WalletGatewayError(WALLET, `${path} answered something unreadable`);
    }
  }

  return {
    wallet: WALLET,
    gatewayRef: (at, unique) => `${vietnamDateCode(at)}_${unique}`,

    async createPayment(credentials, request, signal) {
      const lifetime = Math.round((request.expiresAt.getTime() - request.createdAt.getTime()) / 1000);
      const order = {
        app_id: credentials.appId,
        app_trans_id: request.gatewayRef,
        app_user: APP_USER,
        amount: request.amount.toString(),
        app_time: String(request.createdAt.getTime()),
        embed_data: "{}",
        item: "[]",
      };
      const form: Record<string, string> = {
        ...order,
        description: request.description,
        bank_code: "zalopayapp",
        expire_duration_seconds: String(Math.max(MIN_LIFETIME_SECONDS, lifetime)),
        mac: createOrderMac(credentials.key1, order),
      };
      if (request.callbackUrl !== null) form.callback_url = request.callbackUrl;
      const answer = await post("/v2/create", form, signal);
      if (answer.return_code !== 1) {
        const detail = `${String(answer.return_code)}/${String(answer.sub_return_code)}`;
        throw new WalletGatewayError(WALLET, `create refused (${detail})`);
      }
      const qrContent = textOf(answer.qr_code) ?? textOf(answer.order_url);
      if (qrContent === null) throw new WalletGatewayError(WALLET, "create gave nothing to scan");
      return { qrContent };
    },

    claimedRef(notice) {
      const parts = callbackParts(notice);
      const data = parts === null ? null : parseData(parts.data);
      return textOf(data?.app_trans_id);
    },

    verifyNotice(credentials, notice): WalletPaymentReport | null {
      // A notice in any other shape is refused like a forged one.
      const parts = callbackParts(notice);
      if (parts === null || !/^[0-9a-f]{64}$/i.test(parts.mac)) return null;
      if (!sameSecret(parts.mac.toLowerCase(), callbackMac(credentials.key2, parts.data))) {
        return null;
      }
      const data = parseData(parts.data);
      if (data === null || String(data.app_id) !== credentials.appId) return null;
      const gatewayRef = textOf(data.app_trans_id);
      const amount = wholeNumber(data.amount);
      const transactionId = wholeNumber(data.zp_trans_id);
      if (gatewayRef === null || amount === null || amount <= 0n || transactionId === null) {
        return null;
      }
      return { gatewayRef, amount: vnd(amount), gatewayTransactionId: transactionId.toString() };
    },

    noticeAnswer: (outcome) =>
      outcome === "accepted"
        ? { return_code: 1, return_message: "success" }
        : { return_code: -1, return_message: "mac not equal" },

    async queryStatus(credentials, gatewayRef, signal) {
      const form = {
        app_id: credentials.appId,
        app_trans_id: gatewayRef,
        mac: queryOrderMac(credentials.key1, credentials.appId, gatewayRef),
      };
      const answer = await post("/v2/query", form, signal);
      if (answer.return_code === 1 && answer.is_processing !== true) {
        const amount = wholeNumber(answer.amount);
        const transactionId = wholeNumber(answer.zp_trans_id);
        if (amount === null || amount <= 0n || transactionId === null) {
          throw new WalletGatewayError(WALLET, "query said paid without amount or transaction");
        }
        return {
          status: "paid",
          amount: vnd(amount),
          gatewayTransactionId: transactionId.toString(),
        };
      }
      if (answer.return_code === 1 || answer.return_code === 3) return { status: "pending" };
      if (answer.return_code === 2) return { status: "failed" };
      throw new WalletGatewayError(WALLET, `query answered ${String(answer.return_code)}`);
    },

    refund: async () => ({ kind: "not_supported" }),
  };
}

