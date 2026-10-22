import type { WalletGatewayAdapter } from "./wallet-gateway-adapter";
import { type ZaloPayEnvironment, zaloPayWallet } from "./zalopay-wallet";

/**
 * The e-wallets a branch can turn on, each an adapter under its key. MoMo and VNPay join
 * here when written; nothing else in the server names a wallet.
 */
export function walletGateways(environment: ZaloPayEnvironment): readonly WalletGatewayAdapter[] {
  return [zaloPayWallet({ environment })];
}
