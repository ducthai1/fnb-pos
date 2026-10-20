import { QUANTITY_SCALE, type VoidRecord } from "@fnb/domain";
import type { SyncClient } from "@fnb/sync-client";
import type { ReactNode } from "react";
import type { TillMenu } from "../features/menu/till-menu";
import { adjustRefusal } from "../features/order-adjust/adjust-refusal";
import type { Approval } from "../features/order-adjust/void-line-adjustment";
import type { AdjustableOrder, CounterOrderSession } from "../features/order/order-session-types";
import type { TillPlace } from "../features/order/till-command";
import type { ApprovalOutcome } from "../features/permissions/use-approval-gate";

export type AdjustOutcome =
  | { readonly kind: "back" | "adjusted" | "cancelled" }
  | { readonly kind: "voided"; readonly record: VoidRecord };

/** What every adjustment screen works with: the order as last saved and how to record on it. */
export interface AdjustContext {
  readonly settled: AdjustableOrder;
  readonly session: Pick<CounterOrderSession, "adjustable" | "adjust" | "record">;
  readonly client: Pick<SyncClient, "snapshots">;
  readonly menu: TillMenu;
  readonly place: TillPlace;
  readonly header: ReactNode;
  onDone(outcome: AdjustOutcome): void;
}

/** Whole units, as the cart counts them. */
export const units = (thousandths: bigint) => Number(thousandths / QUANTITY_SCALE);

/** An item's name on the order as last saved. */
export const nameOn = (settled: AdjustableOrder, lineId: string) =>
  settled.priced.lines.find((line) => line.id === lineId)?.nameSnapshot ?? "";

/** The approval an outcome carries (null: none needed); undefined: record nothing. */
export function approvalOf(outcome: ApprovalOutcome): Approval | null | undefined {
  if (outcome.kind === "allowed") return null;
  if (outcome.kind === "approved") return outcome;
  return undefined;
}

/** Runs a confirm step, turning a refusal of the domain or the till into its sentence. */
export async function attempt(run: () => Promise<string | null>): Promise<string | null> {
  try {
    return await run();
  } catch (error) {
    return adjustRefusal(error);
  }
}
