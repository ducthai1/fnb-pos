import { payOrderCommand } from "./pay-order-command";
import { saveDraftCommand } from "./save-draft-command";

/** The commands that change sales orders. */
export const ORDER_SYNC_COMMANDS = [saveDraftCommand, payOrderCommand];
