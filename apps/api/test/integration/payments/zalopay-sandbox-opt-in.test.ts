import { randomBytes } from "node:crypto";
import { vnd } from "@fnb/domain";
import { contentCodeFromRandom } from "@fnb/domain/payment";
import { describe, expect, it } from "vitest";
import { zaloPayWallet } from "../../../src/payments/wallets/zalopay-wallet";

/**
 * Talks to ZaloPay's real sandbox, so it runs only when a person sets a sandbox app's keys
 * (ZaloPay publishes sample ones for testing): FNB_ZALOPAY_SANDBOX_APP_ID, _KEY1, _KEY2.
 * No key is ever written in the repository. It proves the field orders and macs against
 * ZaloPay itself: an order opens, and asking about it before anyone pays says pending.
 */
const env = process.env;
const appId = env.FNB_ZALOPAY_SANDBOX_APP_ID;
const key1 = env.FNB_ZALOPAY_SANDBOX_KEY1;
const key2 = env.FNB_ZALOPAY_SANDBOX_KEY2;
const configured = Boolean(appId && key1 && key2);

describe.skipIf(!configured)("ZaloPay's sandbox", () => {
  it("opens a payment and reports it pending until someone pays", async () => {
    const wallet = zaloPayWallet({ environment: "sandbox" });
    const credentials = { appId: appId ?? "", key1: key1 ?? "", key2: key2 ?? "" };
    const now = new Date();
    const gatewayRef = wallet.gatewayRef(now, contentCodeFromRandom(randomBytes(8)));
    const opened = await wallet.createPayment(
      credentials,
      {
        gatewayRef,
        amount: vnd(10_000n),
        description: "fnb-pos - Thanh toán thử",
        createdAt: now,
        expiresAt: new Date(now.getTime() + 15 * 60_000),
        callbackUrl: null,
      },
      AbortSignal.timeout(15_000),
    );
    expect(opened.qrContent.length).toBeGreaterThan(10);
    const status = await wallet.queryStatus(credentials, gatewayRef, AbortSignal.timeout(15_000));
    expect(status).toEqual({ status: "pending" });
  }, 40_000);
});
