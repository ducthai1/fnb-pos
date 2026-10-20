/** Codes of the invoice commands and routes; the till and backoffice map them to Vietnamese. */
export const EINVOICE_ERROR_CODES = {
  /** The profile names a provider this server has no adapter for. */
  unknownProvider: "API_EINVOICE_UNKNOWN_PROVIDER",
  branchNotFound: "API_BRANCH_NOT_FOUND",
  /** order.set_buyer_info on a branch that issues no invoices. */
  disabled: "SYNC_EINVOICE_DISABLED",
  /** A paid order whose invoice was never queued (it was paid while invoicing was off). */
  invoiceNotFound: "SYNC_EINVOICE_NOT_FOUND",
  /**
   * The invoice went to the provider already. Even a call that failed may have reached it,
   * and the provider answers a resend with what it got first, so it can no longer change.
   */
  alreadySent: "SYNC_EINVOICE_ALREADY_SENT",
  /** The order was cancelled: there is nothing to invoice. */
  orderClosed: "SYNC_EINVOICE_ORDER_CLOSED",
} as const;

/** Why an invoice or a batch is not out yet, as the worker records it on the row. */
export const EINVOICE_FAILURE_CODES = {
  /** The provider threw instead of answering: a dropped connection, a timeout. */
  providerUnreachable: "EINVOICE_PROVIDER_UNREACHABLE",
  /** Temporary failures went on past the retry limit: a person has to look. */
  attemptsExhausted: "EINVOICE_ATTEMPTS_EXHAUSTED",
} as const;
