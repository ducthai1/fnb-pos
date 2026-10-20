/**
 * Codes the payment commands answer with; kept apart from the order, shift and kitchen
 * codes so the command families grow without touching one shared list.
 */
export const PAYMENT_SYNC_ERROR_CODES = {
  /** The intent id is taken by another intent, or one this till may not see. */
  intentIdTaken: "SYNC_PAYMENT_INTENT_ID_TAKEN",
  /** No intent of the till's branch has that id. */
  intentNotFound: "SYNC_PAYMENT_INTENT_NOT_FOUND",
  /** The order already has a QR out; withdraw it before showing another. */
  intentAlreadyPending: "SYNC_PAYMENT_INTENT_ALREADY_PENDING",
  /** A QR of the shop carried that code within the last week; draw a new one. */
  contentCodeTaken: "SYNC_PAYMENT_CONTENT_CODE_TAKEN",
  /** order.pay named an intent of another order. */
  intentOfAnotherOrder: "SYNC_PAYMENT_INTENT_OF_ANOTHER_ORDER",
  /** order.pay named an intent no transfer has paid exactly (pending, partial, overpaid…). */
  intentNotPaid: "SYNC_PAYMENT_INTENT_NOT_PAID",
  /** order.pay put down a different amount than the intent's. */
  intentAmountMismatch: "SYNC_PAYMENT_INTENT_AMOUNT_MISMATCH",
  /**
   * The bank paid a QR of the order exactly and nothing uses that money yet: the order is
   * closed with that QR (order.pay naming it), not in cash, cancelled, or billed again.
   */
  orderHasSettledQr: "SYNC_ORDER_HAS_SETTLED_QR",
} as const;

/** Codes of the payment routes: gateway notices and the backoffice's matching by hand. */
export const PAYMENT_ROUTE_ERROR_CODES = {
  /** No gateway of that name is supported. */
  unknownGateway: "API_PAYMENT_UNKNOWN_GATEWAY",
  /** The notice is not signed by a secret of the shop: it is answered like a stranger's. */
  notAuthenticated: "API_PAYMENT_NOTICE_NOT_AUTHENTICATED",
  /** Signed, but not a transfer the gateway's format describes. */
  unreadableNotice: "API_PAYMENT_NOTICE_UNREADABLE",
  /** The server was started without a key to open stored gateway secrets. */
  notConfigured: "API_PAYMENTS_NOT_CONFIGURED",
  /**
   * Another branch of the shop signs this gateway's notices with that secret: a notice could
   * not tell which branch's account the money went into.
   */
  secretInUse: "API_PAYMENT_SECRET_IN_USE",
  branchNotFound: "API_BRANCH_NOT_FOUND",
  transactionNotFound: "API_PAYMENT_TRANSACTION_NOT_FOUND",
  /** The transfer already pays an intent, or is money that went out. */
  transactionNotMatchable: "API_PAYMENT_TRANSACTION_NOT_MATCHABLE",
  intentNotFound: "API_PAYMENT_INTENT_NOT_FOUND",
  /** The intent was settled or withdrawn; only a pending or expired one takes a transfer. */
  intentNotMatchable: "API_PAYMENT_INTENT_NOT_MATCHABLE",
  /** The transfer arrived in another branch's account than the intent's QR named. */
  branchMismatch: "API_PAYMENT_BRANCH_MISMATCH",
  /**
   * The QR's order was paid another way or cancelled, or another QR of it already brought
   * the money: the transfer is not this order's to take, it is for a person to refund.
   */
  orderNotPayable: "API_PAYMENT_ORDER_NOT_PAYABLE",
} as const;
