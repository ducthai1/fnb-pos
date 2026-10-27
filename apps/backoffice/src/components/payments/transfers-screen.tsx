"use client";

import { ArrowLeftRight, HandCoins, QrCode } from "lucide-react";
import { useMemo } from "react";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { LoadStateView } from "../shell/load-state-view";
import { PageHeader } from "../shell/page-header";
import { useSession } from "../shell/session-context";
import { useApiLoad } from "../shell/use-api-load";
import { StatCard } from "../ui/stat-card";
import { RefundDueList } from "./refund-due-list";
import { TransferMatchForm } from "./transfer-match-form";

const T = vi.transfers;

/** Transfers the system could not match, matched by hand, and money owed back. */
export function TransfersScreen() {
  const api = useApi();
  const { branch } = useSession();
  const branchId = branch?.id ?? null;
  const load = useMemo(
    () => (branchId === null ? null : () => api.listUnmatched(branchId)),
    [api, branchId],
  );
  const [loaded, reload, refresh] = useApiLoad(load);

  return (
    <section className="bo-stack" aria-labelledby="transfers-title">
      <PageHeader section="/payments" title={T.title} titleId="transfers-title" hint={T.hint} />
      {branchId === null ? (
        <p className="bo-muted">{vi.devices.chooseBranch}</p>
      ) : (
        <LoadStateView loaded={loaded} retry={reload}>
          {(payments) => (
            <>
              <section className="bo-stats" aria-label={T.title}>
                <StatCard
                  icon={ArrowLeftRight}
                  tone="amber"
                  label={T.counts.transfers}
                  value={String(payments.transfers.length)}
                  note={T.countsNote.transfers}
                  figure="transfers"
                />
                <StatCard
                  icon={QrCode}
                  tone="info"
                  label={T.counts.intents}
                  value={String(payments.openIntents.length)}
                  note={T.countsNote.intents}
                  figure="intents"
                />
                <StatCard
                  icon={HandCoins}
                  label={T.counts.refundDue}
                  value={String(payments.refundDue.length)}
                  note={T.countsNote.refundDue}
                  figure="refundDue"
                />
              </section>
              <RefundDueList
                intents={payments.refundDue}
                openShifts={payments.openShifts ?? []}
                onHandedBack={refresh}
              />
              <TransferMatchForm key={branchId} payments={payments} onMatched={refresh} />
            </>
          )}
        </LoadStateView>
      )}
    </section>
  );
}
