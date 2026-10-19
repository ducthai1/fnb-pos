import type { ZodType, ZodTypeDef } from "zod";
import { moveCash } from "./cash-move-command";
import { closeShift } from "./close-shift-command";
import { openShift } from "./open-shift-command";
import {
  cashMovePayloadSchema,
  closeShiftPayloadSchema,
  openShiftPayloadSchema,
} from "./shift-request-schemas";
import type { SyncCommandContext } from "./sync-command-context";
import { CommandRejection, SYNC_ERROR_CODES } from "./sync-error-codes";

/**
 * The shift.* commands are routed here as a family, so adding one never touches the order
 * command switch. Their answer and change are the shift, not an order.
 */
export function isShiftCommand(type: string): boolean {
  return type.startsWith("shift.");
}

/** Applies one shift command and returns the id of the shift it changed. */
export function applyShiftCommand(context: SyncCommandContext): Promise<string> {
  const { type, payload } = context.command;
  switch (type) {
    case "shift.open":
      return openShift(context, parsed(openShiftPayloadSchema, payload));
    case "shift.cash_move":
      return moveCash(context, parsed(cashMovePayloadSchema, payload));
    case "shift.close":
      return closeShift(context, parsed(closeShiftPayloadSchema, payload));
    default:
      throw new CommandRejection(SYNC_ERROR_CODES.unknownCommandType);
  }
}

function parsed<T>(schema: ZodType<T, ZodTypeDef, unknown>, payload: unknown): T {
  const result = schema.safeParse(payload);
  if (!result.success) throw new CommandRejection(SYNC_ERROR_CODES.invalidPayload);
  return result.data;
}
