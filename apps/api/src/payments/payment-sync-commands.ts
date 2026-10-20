import { cancelPaymentIntentCommand } from "./cancel-payment-intent-command";
import { createPaymentIntentCommand } from "./create-payment-intent-command";

/** The commands of a QR a till shows: putting it up and taking it down. */
export const PAYMENT_SYNC_COMMANDS = [createPaymentIntentCommand, cancelPaymentIntentCommand];
