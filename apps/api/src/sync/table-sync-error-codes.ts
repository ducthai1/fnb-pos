/**
 * Codes the commands about tables answer with beside the order codes; kept apart so table
 * commands grow without touching the shared list.
 */
export const TABLE_SYNC_ERROR_CODES = {
  /** No table of this branch has that id (another branch's tables read as missing). */
  tableNotFound: "SYNC_TABLE_NOT_FOUND",
  /** The table was taken off the floor plan. */
  tableArchived: "SYNC_TABLE_ARCHIVED",
  /** Another open order already sits at the table: re-read the floor, nothing was overwritten. */
  tableOccupied: "SYNC_TABLE_OCCUPIED",
  /** A saved draft names a table other than its own; moving guests is table.transfer. */
  tableChangeNeedsTransfer: "SYNC_TABLE_CHANGE_NEEDS_TRANSFER",
  /** Only an order seated at a table can be moved to another one. */
  orderNotAtTable: "SYNC_ORDER_NOT_AT_TABLE",
} as const;
