import { type TableStatus, tableStatusOf } from "@fnb/contracts";

/** What a table tile says: the contract's status, or that the bill changed after its pre-bill. */
export type ShownTableStatus = TableStatus | "changed_after_pre_bill";

/**
 * The status of a table from the draft seated at it: changed after its pre-bill once the
 * order moved past the version the guests' pre-bill showed. A server that does not name that
 * version only says whether the pre-bill is current; `preBilled` then holds the orders this
 * till has seen with a current one, and only this till knows they changed.
 */
export function shownStatusOf(
  draft: {
    readonly orderId: string;
    readonly preBillPrinted: boolean;
    readonly version?: number;
    readonly preBillPrintedVersion?: number | null;
  },
  preBilled: ReadonlySet<string>,
): ShownTableStatus {
  const status = tableStatusOf(draft);
  if (status !== "occupied") return status;
  // A server that names the version its last pre-bill showed tells every till, not only
  // the one that saw the pre-bill, that the order changed after it.
  const printed = draft.preBillPrintedVersion;
  const changed =
    typeof printed === "number" && draft.version !== undefined
      ? printed < draft.version
      : preBilled.has(draft.orderId);
  return changed ? "changed_after_pre_bill" : status;
}
