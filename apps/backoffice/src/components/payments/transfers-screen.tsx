"use client";

import { useMemo } from "react";
import type { PaymentIntentSnapshot } from "../../lib/api/payments-api";
import { vndText } from "../../lib/format/business-day";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { LoadStateView } from "../shell/load-state-view";
import { useSession } from "../shell/session-context";
import { useApiLoad } from "../shell/use-api-load";
import { TransferMatchForm } from "./transfer-match-form";

const T = vi.transfers;

/** Money the bank brought for a QR that no order uses: the customer is owed it back. */
function RefundDueList({ intents }: { intents: readonly PaymentIntentSnapshot[] }) {
  return (
    <section className="bo-card bo-stack" aria-labelledby="refund-due-title" data-refund-due>
      <h2 id="refund-due-title" className="bo-subtitle">
        {T.refundTitle} ({intents.length})
      </h2>
      <p className="bo-muted bo-wrap">{T.refundHint}</p>
      {intents.length === 0 ? (
        <p className="bo-muted">{T.none}</p>
      ) : (
        <ul className="bo-day-list__items">
          {intents.map((intent) => (
            <li key={intent.id} className="bo-notice bo-notice--warn bo-wrap" data-intent={intent.id}>
              {T.refundRow(
                intent.contentCode,
                intent.receivedAmount === null ? "—" : vndText(intent.receivedAmount),
                vndText(intent.amount),
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

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
              <RefundDueList intents={payments.refundDue} />
              <TransferMatchForm key={branchId} payments={payments} onMatched={refresh} />
            </>
          )}
        </LoadStateView>
      )}
    </section>
  );
}
