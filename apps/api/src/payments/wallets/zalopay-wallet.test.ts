import { vnd } from "@fnb/domain";
import { describe, expect, it } from "vitest";
import { WalletGatewayError } from "./wallet-gateway-adapter";
import { type WalletFetch, zaloPayWallet } from "./zalopay-wallet";
import { callbackMac, createOrderMac, queryOrderMac } from "./zalopay-signatures";

// Made-up keys: these tests never talk to ZaloPay. The expected macs below were computed
// apart from this code (openssl dgst -sha256 -hmac) over the inputs ZaloPay documents.
const credentials = {
  appId: "554",
  key1: "made-up-key1-for-tests",
  key2: "made-up-key2-for-tests",
};
const AT = new Date("2026-10-21T17:30:00Z"); // 00:30 on 22 October in Vietnam
const REF = "261022_FNB7K3M9Q2X";
const CALLBACK_DATA =
  '{"app_id":554,"app_trans_id":"261022_FNB7K3M9Q2X","amount":39000,' +
  '"zp_trans_id":261022000001234,"server_time":1792600260000}';
const CALLBACK_MAC = "8e1845bffef728e706348f8286049b53bcb4d8cd5b3676a2b08f9bc33d691c6f";

/** A stand-in for ZaloPay's API: records each form posted, answers `answer`. */
function stubZaloPay(answer: Record<string, unknown>, status = 200) {
  const posts: { url: string; form: URLSearchParams }[] = [];
  const fetchStub: WalletFetch = async (url, init) => {
    posts.push({ url, form: new URLSearchParams(String(init.body)) });
    return new Response(JSON.stringify(answer), { status });
  };
  const wallet = zaloPayWallet({ environment: "sandbox", fetch: fetchStub });
  return { wallet, posts };
}

const request = {
  gatewayRef: REF,
  amount: vnd(39_000n),
  description: "Quán Mẫu - Thanh toán đơn hàng",
  createdAt: AT,
  expiresAt: new Date(AT.getTime() + 15 * 60_000),
  callbackUrl: "https://pos.example.vn/webhooks/wallets/zalopay/tenant",
};
const signal = new AbortController().signal;
const notice = (body: unknown) => ({ headers: {}, body });

describe("ZaloPay signatures", () => {
  it("signs a created order with key1 over app_id|app_trans_id|app_user|amount|app_time|embed_data|item", () => {
    const order = {
      app_id: "554",
      app_trans_id: REF,
      app_user: "fnb_pos",
      amount: "39000",
      app_time: "1792603800000",
      embed_data: "{}",
      item: "[]",
    };
    expect(createOrderMac(credentials.key1, order)).toBe(
      "cf5b6e11704295ca4a877659f9fae50a723ac33afb7d14fa7e481b7f4745da02",
    );
  });

  it("signs a query with key1 over app_id|app_trans_id|key1", () => {
    expect(queryOrderMac(credentials.key1, "554", REF)).toBe(
      "fff6376f5db3ec5986e350ac7d66c3dae51165dae054cd64f9106c333e2bceb9",
    );
  });

  it("checks a callback with key2 over its data string as sent", () => {
    expect(callbackMac(credentials.key2, CALLBACK_DATA)).toBe(CALLBACK_MAC);
  });
});

describe("the ZaloPay wallet", () => {
  it("names a payment yymmdd_<unique> by Vietnam's date, not UTC's", () => {
    const { wallet } = stubZaloPay({});
    expect(wallet.gatewayRef(AT, "FNB7K3M9Q2X")).toBe(REF);
  });

  it("opens a payment for the server's amount, signed, and answers what to scan", async () => {
    const { wallet, posts } = stubZaloPay({
      return_code: 1,
      order_url: "https://qcgateway.zalopay.vn/openinapp?order=x",
      qr_code: "00020101021226520010vn.zalopay",
    });
    const opened = await wallet.createPayment(credentials, request, signal);
    expect(opened.qrContent).toBe("00020101021226520010vn.zalopay");
    expect(posts).toHaveLength(1);
    const { url, form } = posts[0] ?? { url: "", form: new URLSearchParams() };
    expect(url).toBe("https://sb-openapi.zalopay.vn/v2/create");
    expect(Object.fromEntries(form)).toMatchObject({
      app_id: "554",
      app_trans_id: REF,
      app_user: "fnb_pos",
      amount: "39000",
      app_time: "1792603800000",
      embed_data: "{}",
      item: "[]",
      expire_duration_seconds: "900",
      callback_url: request.callbackUrl,
      mac: "cf5b6e11704295ca4a877659f9fae50a723ac33afb7d14fa7e481b7f4745da02",
    });
  });

  it("falls back to the payment page when ZaloPay sends no QR string", async () => {
    const { wallet } = stubZaloPay({ return_code: 1, order_url: "https://qcgateway.zalopay.vn/x" });
    expect((await wallet.createPayment(credentials, request, signal)).qrContent).toBe(
      "https://qcgateway.zalopay.vn/x",
    );
  });

  it.each([
    ["refuses", { return_code: 2, sub_return_code: -68 }, 200],
    ["answers an error status", { return_code: 1, order_url: "x" }, 500],
  ])("raises a gateway error when ZaloPay %s", async (_case, answer, status) => {
    const { wallet } = stubZaloPay(answer, status);
    await expect(wallet.createPayment(credentials, request, signal)).rejects.toBeInstanceOf(
      WalletGatewayError,
    );
  });

  it("proves a callback signed with key2 and reads the payment in it", () => {
    const { wallet } = stubZaloPay({});
    const body = { data: CALLBACK_DATA, mac: CALLBACK_MAC, type: 1 };
    expect(wallet.claimedRef(notice(body))).toBe(REF);
    expect(wallet.verifyNotice(credentials, notice(body))).toEqual({
      gatewayRef: REF,
      amount: vnd(39_000n),
      gatewayTransactionId: "261022000001234",
    });
  });

  it.each([
    ["an amount raised after signing", CALLBACK_DATA.replace("39000", "39001"), CALLBACK_MAC],
    ["another mac", CALLBACK_DATA, CALLBACK_MAC.replace(/^8/, "9")],
    ["no mac", CALLBACK_DATA, ""],
  ])("refuses a callback with %s", (_case, data, mac) => {
    const { wallet } = stubZaloPay({});
    expect(wallet.verifyNotice(credentials, notice({ data, mac, type: 1 }))).toBeNull();
  });

  it("refuses a callback signed with another app's key2", () => {
    const { wallet } = stubZaloPay({});
    const body = { data: CALLBACK_DATA, mac: CALLBACK_MAC, type: 1 };
    expect(wallet.verifyNotice({ ...credentials, key2: "another-key2-entirely" }, notice(body)))
      .toBeNull();
    expect(wallet.verifyNotice({ ...credentials, appId: "2553" }, notice(body))).toBeNull();
  });

  it("answers ZaloPay's return codes: 1 taken, -1 refused", () => {
    const { wallet } = stubZaloPay({});
    expect(wallet.noticeAnswer("accepted")).toEqual({ return_code: 1, return_message: "success" });
    expect(wallet.noticeAnswer("refused")).toMatchObject({ return_code: -1 });
  });

  it("asks about a payment signed, and reads paid, processing and failed", async () => {
    const paid = stubZaloPay({ return_code: 1, amount: 39_000, zp_trans_id: 261022000001234 });
    expect(await paid.wallet.queryStatus(credentials, REF, signal)).toEqual({
      status: "paid",
      amount: vnd(39_000n),
      gatewayTransactionId: "261022000001234",
    });
    expect(paid.posts[0]?.url).toBe("https://sb-openapi.zalopay.vn/v2/query");
    expect(Object.fromEntries(paid.posts[0]?.form ?? [])).toEqual({
      app_id: "554",
      app_trans_id: REF,
      mac: "fff6376f5db3ec5986e350ac7d66c3dae51165dae054cd64f9106c333e2bceb9",
    });
    const waiting = stubZaloPay({ return_code: 3, is_processing: true });
    expect(await waiting.wallet.queryStatus(credentials, REF, signal)).toEqual({
      status: "pending",
    });
    const failed = stubZaloPay({ return_code: 2 });
    expect(await failed.wallet.queryStatus(credentials, REF, signal)).toEqual({ status: "failed" });
  });

  it("does not take money back through ZaloPay yet", async () => {
    expect(await stubZaloPay({}).wallet.refund()).toEqual({ kind: "not_supported" });
  });
});
