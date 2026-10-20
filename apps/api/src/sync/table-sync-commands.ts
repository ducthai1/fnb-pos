import { markPreBillPrintedCommand } from "./mark-pre-bill-printed-command";
import { transferTableCommand } from "./transfer-table-command";

/** The commands of serving at tables: moving guests, and the pre-bill that sets "waiting to pay". */
export const TABLE_SYNC_COMMANDS = [transferTableCommand, markPreBillPrintedCommand];
