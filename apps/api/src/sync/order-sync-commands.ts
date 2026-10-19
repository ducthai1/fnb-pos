import { applyDiscountCommand } from "./apply-discount-command";
import { cancelOrderCommand } from "./cancel-order-command";
import { payOrderCommand } from "./pay-order-command";
import { refundOrderCommand } from "./refund-order-command";
import { removeDiscountCommand } from "./remove-discount-command";
import { saveDraftCommand } from "./save-draft-command";
import { voidLineCommand } from "./void-line-command";

/** The commands that change sales orders. */
export const ORDER_SYNC_COMMANDS = [
  saveDraftCommand,
  payOrderCommand,
  voidLineCommand,
  applyDiscountCommand,
  removeDiscountCommand,
  cancelOrderCommand,
  refundOrderCommand,
];
