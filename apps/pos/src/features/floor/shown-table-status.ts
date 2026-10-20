import { type TableStatus, tableStatusOf } from "@fnb/contracts";

/** What a table tile says: the contract's status, or that the bill changed after its pre-bill. */
export type ShownTableStatus = TableStatus | "changed_after_pre_bill";

/**
 * The status of a table from the draft seated at it. `preBilled` holds the orders this till
 * has seen with a current pre-bill: once such an order changes, the guests hold a pre-bill
 * that no longer matches, which the server cannot say (it only knows whether it is current).
 */
export function shownStatusOf(
  draft: { readonly orderId: string; readonly preBillPrinted: boolean },
  preBilled: ReadonlySet<string>,
): ShownTableStatus {
  const status = tableStatusOf(draft);
  return status === "occupied" && preBilled.has(draft.orderId) ? "changed_after_pre_bill" : status;
}
