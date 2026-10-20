import { randomBytes } from "node:crypto";
import { newId } from "@fnb/db";
import type { RowSpec, Sql } from "./tenant-graph-rows";

const aBranch: Sql = { sql: "(SELECT id FROM branch ORDER BY id LIMIT 1)" };
const aDevice: Sql = { sql: "(SELECT id FROM device ORDER BY id LIMIT 1)" };

/** A transfer code that is new on every call; a withdrawn intent keeps it out of the live index. */
const freshContentCode = () => {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  return `FNB${[...randomBytes(8)].map((byte) => alphabet.charAt(byte & 0x1f)).join("")}`;
};

/** A gateway key that is new on every call, as one branch has one endpoint per gateway. */
const freshGateway = () => `g${randomBytes(12).toString("hex")}`;

/** RowSpecs of the payment tables, merged into the tenant graph's ROWS. */
export const PAYMENT_ROWS = {
  payment_intent: {
    parent: { column: "order_id", table: "sales_order" },
    values: () => ({
      branch_id: aBranch,
      device_id: aDevice,
      amount: 1000,
      content_code: freshContentCode(),
      status: "cancelled",
      expires_at: new Date(),
    }),
  },
  bank_transaction: {
    parent: { column: "branch_id", table: "branch" },
    values: () => ({
      gateway: "fake",
      reference_code: newId(),
      amount: 1000,
      content: "x",
      transfer_type: "in",
      occurred_at: new Date(),
      received_at: new Date(),
      raw: "{}",
    }),
  },
  payment_webhook_endpoint: {
    parent: { column: "branch_id", table: "branch" },
    values: () => ({ gateway: freshGateway(), secret_ciphertext: "v1.a.b.c" }),
  },
} satisfies Record<string, RowSpec>;
