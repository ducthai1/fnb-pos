/**
 * Codes the kitchen commands answer with beside the domain's; kept apart from the order
 * and shift codes so the command families grow without touching one shared list.
 */
export const KITCHEN_SYNC_ERROR_CODES = {
  /** The order is posted or cancelled: nothing more goes to a station under it. */
  orderClosed: "SYNC_KITCHEN_ORDER_CLOSED",
  /**
   * A ticket line the order does not owe the stations as the server holds it, or more units
   * of it than are owed: recording it would mark food as made that nobody was told to make.
   */
  notOwed: "SYNC_KITCHEN_NOT_OWED",
  /** A station that is not one of the till's branch. */
  stationNotFound: "SYNC_KITCHEN_STATION_NOT_FOUND",
  /** The ticket id is already taken by another ticket. */
  ticketIdTaken: "SYNC_KITCHEN_TICKET_ID_TAKEN",
} as const;
