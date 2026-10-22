import type { PaymentGatewayAdapter } from "./gateways/payment-gateway-adapter";
import type { WalletGatewayAdapter } from "./wallets/wallet-gateway-adapter";
import type { WebhookSecretBox } from "./webhook-secret-box";

/** What the payment routes need beyond the API context. */
export interface PaymentRouteDependencies {
  readonly gateways: ReadonlyMap<string, PaymentGatewayAdapter>;
  /** The e-wallets branches may turn on, by key. */
  readonly wallets: ReadonlyMap<string, WalletGatewayAdapter>;
  /** The server's public base URL a wallet's notice is sent to; null when unreachable. */
  readonly walletCallbackBase: string | null;
  /** Null when the server was started without a payment secret key. */
  readonly secretBox: WebhookSecretBox | null;
}
