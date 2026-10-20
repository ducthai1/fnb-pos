import { DomainError } from "../errors";
import { type Vnd, vnd } from "../money";
import {
  INITIATION,
  VIETQR_ACCOUNT_SERVICE,
  VIETQR_GUID,
  VIETQR_TAGS,
  VND_CURRENCY_CODE,
} from "./build-vietqr-payload";
import { crc16Hex } from "./crc16-ccitt-false";
import { decodeTlv } from "./emv-tlv";
import { PAYMENT_ERROR_CODES } from "./payment-error-codes";

export interface ParsedVietQr {
  initiation: "static" | "dynamic";
  bankBin: string;
  accountNumber: string;
  /** Null on a static QR, where the customer types the amount. */
  amount: Vnd | null;
  content: string | null;
  merchantName: string | null;
}

/**
 * Reads a VietQR bank-account transfer back from its text, checksum first: what a till
 * shows can be read the way a bank app reads it, and a payload cut or changed in transit
 * is refused rather than read in part.
 */
export function parseVietQrPayload(payload: string): ParsedVietQr {
  if (!/^[\x20-\x7e]+$/.test(payload)) throw notReadable("payload is not printable ASCII");
  const crcAt = payload.length - 8;
  if (crcAt < 0 || payload.slice(crcAt, crcAt + 4) !== `${VIETQR_TAGS.crc}04`) {
    throw notReadable("payload does not end with its checksum");
  }
  if (payload.slice(crcAt + 4).toUpperCase() !== crc16Hex(payload.slice(0, crcAt + 4))) {
    throw new DomainError(PAYMENT_ERROR_CODES.checksumMismatch, "checksum does not match");
  }
  const T = VIETQR_TAGS;
  const fields = decodeTlv(payload.slice(0, crcAt));
  const account = decodeTlv(required(fields, T.merchantAccount));
  const beneficiary = decodeTlv(required(account, "01"));
  const initiation = required(fields, T.initiation);
  if (
    required(fields, T.formatIndicator) !== "01" ||
    (initiation !== INITIATION.static && initiation !== INITIATION.dynamic) ||
    required(account, "00") !== VIETQR_GUID ||
    required(account, "02") !== VIETQR_ACCOUNT_SERVICE ||
    required(fields, T.currency) !== VND_CURRENCY_CODE ||
    required(fields, T.country) !== "VN"
  ) {
    throw new DomainError(PAYMENT_ERROR_CODES.notAVietQrTransfer, "not a VietQR transfer");
  }
  const amountText = fields.get(T.amount);
  if (amountText !== undefined && !/^[1-9]\d*$/.test(amountText)) {
    throw new DomainError(PAYMENT_ERROR_CODES.invalidAmount, "amount is not whole đồng");
  }
  const additional = fields.get(T.additionalData);
  return {
    initiation: initiation === INITIATION.dynamic ? "dynamic" : "static",
    bankBin: required(beneficiary, "00"),
    accountNumber: required(beneficiary, "01"),
    amount: amountText === undefined ? null : vnd(BigInt(amountText)),
    content: additional === undefined ? null : (decodeTlv(additional).get(T.purpose) ?? null),
    merchantName: fields.get(T.merchantName) ?? null,
  };
}

function required(fields: ReadonlyMap<string, string>, tag: string): string {
  const value = fields.get(tag);
  if (value === undefined) {
    throw new DomainError(PAYMENT_ERROR_CODES.notAVietQrTransfer, `field ${tag} is missing`);
  }
  return value;
}

function notReadable(message: string): DomainError {
  return new DomainError(PAYMENT_ERROR_CODES.malformedPayload, message);
}
