import { cancelPaymentIntentCommand } from "./cancel-payment-intent-command";
import { createPaymentIntentCommand } from "./create-payment-intent-command";
import { handBackQrExcessCommand } from "./hand-back-qr-excess-command";

/**
 * The commands of a QR a till shows: putting it up, taking it down, and handing back in
 * cash what a customer transferred over.
 */
export const PAYMENT_SYNC_COMMANDS = [
  createPaymentIntentCommand,
  cancelPaymentIntentCommand,
  handBackQrExcessCommand,
];
