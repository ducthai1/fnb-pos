import { type Vnd, expectedCash, formatVnd } from "@fnb/domain";
import type { SyncClient } from "@fnb/sync-client";
import { type ReactNode, useState } from "react";
import type { TillPlace } from "../features/order/till-command";
import { useTillPermissions } from "../features/permissions/till-permissions-context";
import { useApprovalGate } from "../features/permissions/use-approval-gate";
import { cashMoveActionFor } from "../features/shift/shift-cash";
import { cashMoveCommand } from "../features/shift/shift-commands";
import { useShiftLedger } from "../features/shift/use-shift-ledger";
import { vi } from "../messages/vi";
import { CashMoveScreen } from "../screens/shift/cash-move-screen";
import { ScreenFrame } from "../screens/shared/screen-frame";
import { approvalOf, attempt } from "./adjust-flow-parts";

const A = vi.approval.actions;

export interface CashMoveFlowProps {
  client: SyncClient;
  place: TillPlace;
  header: ReactNode;
  shiftId: string;
  onBack(): void;
}

/**
 * Cash in or out of the drawer: judged on everything moved through the shift's drawer once
 * this move is made, whoever moved it, so ten small moves cannot pass the cap unseen; past
 * it, a manager.
 */
export function CashMoveFlow(props: CashMoveFlowProps) {
  const { client, place } = props;
  const gate = useApprovalGate();
  const { authority } = useTillPermissions();
  const book = useShiftLedger(client, props.shiftId);
  const [done, setDone] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  if (gate.sheet !== null) return gate.sheet;
  if (book === null) {
    return (
      <ScreenFrame title={vi.cash.title}>
        {props.header}
        <div className="pos-spinner" aria-hidden="true" />
      </ScreenFrame>
    );
  }
  const { shift, ledger } = book;
  const staffId = authority.staffId;
  const expectedAfter = (kind: "in" | "out", amount: Vnd) =>
    expectedCash({
      ...ledger,
      events: [...ledger.events, { kind: kind === "in" ? "cash_in" : "cash_out", amount, staffId }],
    });

  return (
    <CashMoveScreen
      key={round}
      header={props.header}
      notice={done}
      expectedAfter={expectedAfter}
      onBack={props.onBack}
      onConfirm={(kind, amount, reason) =>
        attempt(async () => {
          const action = cashMoveActionFor(shift, staffId, kind, amount);
          const money = formatVnd(amount);
          const said = kind === "in" ? A.cashIn(money) : A.cashOut(money);
          const total = action.amount ?? amount;
          const described =
            total === amount ? said : `${said} (${A.cashInShift(formatVnd(total))})`;
          const outcome = await gate.require(action, described);
          if (outcome.kind === "denied") return vi.approval.denied;
          const approval = approvalOf(outcome);
          if (approval === undefined) return null;
          const move = { kind, amount, reason, approvalId: approval?.approvalId ?? null };
          await client.enqueue(cashMoveCommand(place, shift, staffId, move, Date.now()));
          setDone(vi.cash.done(kind, money));
          setRound((n) => n + 1);
          return null;
        })
      }
    />
  );
}
