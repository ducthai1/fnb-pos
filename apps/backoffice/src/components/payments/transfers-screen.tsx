"use client";

import { useMemo } from "react";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { LoadStateView } from "../shell/load-state-view";
import { useSession } from "../shell/session-context";
import { useApiLoad } from "../shell/use-api-load";
import { RefundDueList } from "./refund-due-list";
import { TransferMatchForm } from "./transfer-match-form";

const T = vi.transfers;

/** Transfers the system could not match, matched by hand, and money owed back. */
export function TransfersScreen() {
  const api = useApi();
  const { branch } = useSession();
  const branchId = branch?.id ?? null;
  const load = useMemo(() => (branchId === null ? null : () => api.listUnmatched(branchId)), [api, branchId]);
  const [loaded, reload, refresh] = useApiLoad(load);

  return (
    <section className="bo-stack" aria-labelledby="transfers-title">
      <h1 id="transfers-title" className="bo-title">
        {T.title}
      </h1>
      <p className="bo-muted bo-wrap">{T.hint}</p>
      {branchId === null ? (
        <p className="bo-muted">{vi.devices.chooseBranch}</p>
      ) : (
        <LoadStateView loaded={loaded} retry={reload}>
          {(payments) => (
            <>
              <RefundDueList intents={payments.refundDue} onHandedBack={refresh} />
              <TransferMatchForm key={branchId} payments={payments} onMatched={refresh} />
            </>
          )}
        </LoadStateView>
      )}
    </section>
  );
}
