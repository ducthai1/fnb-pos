import type { PaymentGatewayAdapter } from "./payment-gateway-adapter";
import { payosGateway } from "./payos-gateway";
import { sepayGateway } from "./sepay-gateway";

/** The gateways a shop can point at its webhook, by the key in the webhook's path. */
export const PAYMENT_GATEWAYS: readonly PaymentGatewayAdapter[] = [sepayGateway, payosGateway];

/** The adapters by key; two of one key are a bug, so they fail at startup. */
export function gatewaysByKey(
  adapters: readonly PaymentGatewayAdapter[],
): ReadonlyMap<string, PaymentGatewayAdapter> {
  const byKey = new Map<string, PaymentGatewayAdapter>();
  for (const adapter of adapters) {
    if (!/^[a-z][a-z0-9_]{0,31}$/.test(adapter.gateway) || byKey.has(adapter.gateway)) {
      throw new Error(`payment gateway key unusable or taken: ${adapter.gateway}`);
    }
    byKey.set(adapter.gateway, adapter);
  }
  return byKey;
}
