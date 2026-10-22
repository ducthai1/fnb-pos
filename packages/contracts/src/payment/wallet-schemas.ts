import { z } from "zod";
import { wholeDongSchema } from "../primitives/money-schema";
import { uuidSchema } from "../primitives/uuid-schema";
import { paymentIntentSnapshotSchema } from "./payment-intent-snapshot-schema";

/**
 * The e-wallets a branch can take payment through, by the key the server registers each
 * one's adapter under. They are interchangeable: a till offers a card for each wallet its
 * branch turned on, in this order.
 */
export const WALLET_KEYS = ["zalopay"] as const;
export type WalletKey = (typeof WALLET_KEYS)[number];

export const walletKeySchema = z.enum(WALLET_KEYS);

/** The setting a till reads (resolved for its branch by the server) to know its wallets. */
export const PAYMENT_WALLETS_SETTING = "payment_wallets";

/** What a till's settings say about wallets: the keys turned on, none when unreadable. */
export function walletsOfSettings(settings: Readonly<Record<string, unknown>>): WalletKey[] {
  const parsed = z.array(walletKeySchema).safeParse(settings[PAYMENT_WALLETS_SETTING]);
  return parsed.success ? WALLET_KEYS.filter((key) => parsed.data.includes(key)) : [];
}

/**
 * POST /pos/wallet-payments: the till asks the server to open a wallet payment for the
 * order. `amount` is what the till shows; the server asks the wallet for its own total and
 * refuses when the two differ. `intentId` is drawn by the till, so asking again after a
 * lost answer gets the same payment back instead of a second one.
 */
export const walletPaymentBodySchema = z
  .object({
    intentId: uuidSchema,
    orderId: uuidSchema,
    wallet: walletKeySchema,
    amount: wholeDongSchema.positive(),
  })
  .strict();

export type WalletPaymentBody = z.infer<typeof walletPaymentBodySchema>;

/** The payment the wallet opened: the intent, and what the customer scans to pay it. */
export const walletPaymentAnswerSchema = z
  .object({
    intent: paymentIntentSnapshotSchema,
    wallet: walletKeySchema,
    qrContent: z.string().min(1).max(2048),
  })
  .strict();

export type WalletPaymentAnswer = z.infer<typeof walletPaymentAnswerSchema>;

const walletKeyText = z.string().regex(/^[\x21-\x7e]{8,256}$/);

/**
 * PUT /payments/wallets/:branchId/:wallet: turns the wallet on or off for the branch, and
 * sets its keys when `credentials` is given. Keys once saved are never sent back.
 */
export const walletAccountBodySchema = z
  .object({
    enabled: z.boolean(),
    credentials: z
      .object({
        appId: z.string().regex(/^[0-9]{1,12}$/),
        key1: walletKeyText,
        key2: walletKeyText,
      })
      .strict()
      .optional(),
  })
  .strict();

export type WalletAccountBody = z.infer<typeof walletAccountBodySchema>;

/** GET /payments/wallets/:branchId: each wallet, whether it is on and whether keys are saved. */
export const walletAccountsSchema = z
  .object({
    wallets: z.array(
      z.object({ wallet: walletKeySchema, enabled: z.boolean(), saved: z.boolean() }).strict(),
    ),
  })
  .strict();

export type WalletAccounts = z.infer<typeof walletAccountsSchema>;
