import { createHmac } from "node:crypto";

/** HMAC-SHA256 in lowercase hex, as ZaloPay signs and checks every message. */
export const zaloPayHmac = (key: string, input: string): string =>
  createHmac("sha256", key).update(input, "utf8").digest("hex");

/** The fields of a create-order request that its mac covers. */
export interface ZaloPayOrderFields {
  readonly app_id: string;
  readonly app_trans_id: string;
  readonly app_user: string;
  readonly amount: string;
  readonly app_time: string;
  readonly embed_data: string;
  readonly item: string;
}

/** Create order: key1 over app_id|app_trans_id|app_user|amount|app_time|embed_data|item. */
export function createOrderMac(key1: string, order: ZaloPayOrderFields): string {
  const input = [
    order.app_id,
    order.app_trans_id,
    order.app_user,
    order.amount,
    order.app_time,
    order.embed_data,
    order.item,
  ].join("|");
  return zaloPayHmac(key1, input);
}

/** Query order: key1 over app_id|app_trans_id|key1 (the key is part of the input too). */
export function queryOrderMac(key1: string, appId: string, appTransId: string): string {
  return zaloPayHmac(key1, [appId, appTransId, key1].join("|"));
}

/** Callback: key2 over the `data` string exactly as it arrived, before any JSON parsing. */
export function callbackMac(key2: string, data: string): string {
  return zaloPayHmac(key2, data);
}
