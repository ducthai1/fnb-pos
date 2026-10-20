import { cashMoveCommand } from "./cash-move-command";
import { closeShiftCommand } from "./close-shift-command";
import { openShiftCommand } from "./open-shift-command";

/** The commands that open, move cash in and close a till's shift; each answers the shift. */
export const SHIFT_SYNC_COMMANDS = [openShiftCommand, cashMoveCommand, closeShiftCommand];
