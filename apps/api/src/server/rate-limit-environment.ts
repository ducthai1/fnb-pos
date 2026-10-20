import { z } from "zod";
import { isAddressOrRange } from "../http/client-address";
import type { RateLimitSettings } from "../http/rate-limit-hooks";

const perWindow = (fallback: number) =>
  z.coerce
    .number({ message: "must be a whole number of requests" })
    .int("must be a whole number of requests")
    .min(1, "must be at least 1")
    .max(100_000, "must be at most 100000")
    .default(fallback);

/**
 * The rate limit variables. Each has a default meant for one café: managers signing in
 * from the shop's one public address, a few tills behind the same address opening staff
 * sessions at a shift change, a manager approving discounts during the evening rush.
 */
export const rateLimitEnvironment = {
  FNB_RATE_LIMIT_WINDOW_SECONDS: z.coerce
    .number({ message: "must be a whole number of seconds" })
    .int("must be a whole number of seconds")
    .min(1, "must be at least 1")
    .max(3_600, "must be at most 3600")
    .default(60),
  FNB_RATE_LIMIT_LOGIN_PER_ADDRESS: perWindow(30),
  FNB_RATE_LIMIT_LOGIN_PER_ACCOUNT: perWindow(10),
  FNB_RATE_LIMIT_PAIRING_PER_ADDRESS: perWindow(10),
  FNB_RATE_LIMIT_TILL_PER_ADDRESS: perWindow(300),
  FNB_RATE_LIMIT_TILL_PER_DEVICE: perWindow(60),
  FNB_TRUSTED_PROXIES: z
    .string()
    .transform((text) => text.split(",").map((entry) => entry.trim()))
    .refine(
      (list) => list.every(isAddressOrRange),
      "must be a comma separated list of addresses or ranges such as 127.0.0.1,::1",
    )
    .optional(),
};

type RateLimitValues = z.output<z.ZodObject<typeof rateLimitEnvironment>>;

export function rateLimitSettingsOf(values: RateLimitValues): RateLimitSettings {
  return {
    windowMillis: values.FNB_RATE_LIMIT_WINDOW_SECONDS * 1000,
    loginPerAddress: values.FNB_RATE_LIMIT_LOGIN_PER_ADDRESS,
    loginPerAccount: values.FNB_RATE_LIMIT_LOGIN_PER_ACCOUNT,
    pairingPerAddress: values.FNB_RATE_LIMIT_PAIRING_PER_ADDRESS,
    tillPerAddress: values.FNB_RATE_LIMIT_TILL_PER_ADDRESS,
    tillPerDevice: values.FNB_RATE_LIMIT_TILL_PER_DEVICE,
    trustedProxies: values.FNB_TRUSTED_PROXIES ?? [],
  };
}
