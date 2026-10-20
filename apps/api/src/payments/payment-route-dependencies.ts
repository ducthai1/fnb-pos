import type { PaymentGatewayAdapter } from "./gateways/payment-gateway-adapter";
import type { WebhookSecretBox } from "./webhook-secret-box";

/** What the payment routes need beyond the API context. */
export interface PaymentRouteDependencies {
  readonly gateways: ReadonlyMap<string, PaymentGatewayAdapter>;
  /** Null when the server was started without a payment secret key. */
  readonly secretBox: WebhookSecretBox | null;
}
