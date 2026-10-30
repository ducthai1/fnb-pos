import { dismissRejectionCommand } from "./dismiss-rejection-command";
import { printJobReportedCommand } from "./print-job-reported-command";

/** The commands that report how the till's printers did, and that a refusal was set aside; none answers a synced row. */
export const PRINT_SYNC_COMMANDS = [printJobReportedCommand, dismissRejectionCommand];
