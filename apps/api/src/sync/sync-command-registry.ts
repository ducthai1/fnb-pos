import { ORDER_SYNC_COMMANDS } from "./order-sync-commands";
import { syncCommandRegistry } from "./sync-command-definition";
import { TABLE_SYNC_COMMANDS } from "./table-sync-commands";

/**
 * Every command type the server applies. Each domain lists its commands in a file of its
 * own (one definition per command file) and adds the list here, so domains added side by
 * side touch one line each.
 */
export const SYNC_COMMANDS = syncCommandRegistry([...ORDER_SYNC_COMMANDS, ...TABLE_SYNC_COMMANDS]);
