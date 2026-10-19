import type { ZodType, ZodTypeDef } from "zod";
import type { SyncCommandContext } from "./sync-command-context";
import { CommandRejection, SYNC_ERROR_CODES } from "./sync-error-codes";

/** One command type the server applies: its name and what it does with a payload. */
export interface SyncCommandDefinition {
  readonly type: string;
  /**
   * Checks the payload against the command's contract and applies it inside the command's
   * transaction. Answers the id of the order it changed, whose snapshot goes back to the
   * till and into the change feed.
   */
  readonly apply: (context: SyncCommandContext, payload: unknown) => Promise<string>;
}

/**
 * A command type from its payload contract and its handler. A payload the contract refuses
 * is a stored rejection of that one command, never an error for the whole batch.
 */
export function defineSyncCommand<P>(
  type: string,
  payloadSchema: ZodType<P, ZodTypeDef, unknown>,
  handler: (context: SyncCommandContext, payload: P) => Promise<string>,
): SyncCommandDefinition {
  return {
    type,
    apply: async (context, payload) => {
      const parsed = payloadSchema.safeParse(payload);
      if (!parsed.success) throw new CommandRejection(SYNC_ERROR_CODES.invalidPayload);
      return handler(context, parsed.data);
    },
  };
}

/** The definitions by type; two definitions of one type are a bug, so they fail at startup. */
export function syncCommandRegistry(
  definitions: readonly SyncCommandDefinition[],
): ReadonlyMap<string, SyncCommandDefinition> {
  const byType = new Map<string, SyncCommandDefinition>();
  for (const definition of definitions) {
    if (byType.has(definition.type)) {
      throw new Error(`sync command type defined twice: ${definition.type}`);
    }
    byType.set(definition.type, definition);
  }
  return byType;
}
