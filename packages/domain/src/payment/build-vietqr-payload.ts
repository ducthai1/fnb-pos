import type { Vnd } from "../money";
import { crc16Hex } from "./crc16-ccitt-false";
import { encodeTlv } from "./emv-tlv";
import {
  assertAccountNumber,
  assertBankBin,
  assertMerchantName,
  assertQrAmount,
  assertTransferContent,
} from "./vietqr-field-rules";

/** The NAPAS application id that marks a merchant account field as VietQR. */
export const VIETQR_GUID = "A000000727";
/** NAPAS 247 transfer to a bank account (QRIBFTTC would be to a card number). */
export const VIETQR_ACCOUNT_SERVICE = "QRIBFTTA";
export const VND_CURRENCY_CODE = "704";

export const VIETQR_TAGS = {
  formatIndicator: "00",
  initiation: "01",
  merchantAccount: "38",
  currency: "53",
  amount: "54",
  country: "58",
  merchantName: "59",
  additionalData: "62",
  purpose: "08",
  crc: "63",
} as const;

/** "11": a QR printed once and reused; "12": made for one payment, amount included. */
export const INITIATION = { static: "11", dynamic: "12" } as const;

export interface VietQrTransfer {
  bankBin: string;
  accountNumber: string;
  amount: Vnd;
  /** What the customer's bank puts in the transfer's description: the code it is matched by. */
  content: string;
  merchantName?: string;
}

/**
 * The text of a one-time VietQR (EMVCo merchant-presented QR as NAPAS profiles it) asking
 * for `amount` into the account, with `content` as the transfer description. Built on the
 * till itself, so a QR can be shown while the shop is offline. Every field is checked
 * first: a QR that a bank app reads differently from what was meant sends money astray.
 */
export function buildVietQrPayload(transfer: VietQrTransfer): string {
  assertBankBin(transfer.bankBin);
  assertAccountNumber(transfer.accountNumber);
  assertQrAmount(transfer.amount);
  assertTransferContent(transfer.content);
  if (transfer.merchantName !== undefined) assertMerchantName(transfer.merchantName);
  const T = VIETQR_TAGS;
  const beneficiary = encodeTlv("00", transfer.bankBin) + encodeTlv("01", transfer.accountNumber);
  const merchantAccount =
    encodeTlv("00", VIETQR_GUID) +
    encodeTlv("01", beneficiary) +
    encodeTlv("02", VIETQR_ACCOUNT_SERVICE);
  const body = [
    encodeTlv(T.formatIndicator, "01"),
    encodeTlv(T.initiation, INITIATION.dynamic),
    encodeTlv(T.merchantAccount, merchantAccount),
    encodeTlv(T.currency, VND_CURRENCY_CODE),
    encodeTlv(T.amount, transfer.amount.toString()),
    encodeTlv(T.country, "VN"),
    transfer.merchantName === undefined ? "" : encodeTlv(T.merchantName, transfer.merchantName),
    encodeTlv(T.additionalData, encodeTlv(T.purpose, transfer.content)),
  ].join("");
  // The checksum covers everything before it, its own tag and length included.
  const signed = `${body}${T.crc}04`;
  return signed + crc16Hex(signed);
}
