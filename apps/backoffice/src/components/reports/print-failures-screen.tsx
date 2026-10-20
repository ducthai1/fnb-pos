"use client";

import { useMemo, useState } from "react";
import type { PrintFailures } from "../../lib/api/reports-api";
import { shopDaysWindow, todaysBusinessDate } from "../../lib/format/business-day";
import { formatDateTime } from "../../lib/format/format-time";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { LoadStateView } from "../shell/load-state-view";
import { useSession } from "../shell/session-context";
import { useApiLoad } from "../shell/use-api-load";
import { SimpleTable } from "../ui/simple-table";
import { TextField } from "../ui/text-field";

const T = vi.printFailures;
const C = T.columns;

function PrintFailuresTable({ answer }: { answer: PrintFailures }) {
  return (
    <div className="bo-card">
      {answer.truncated && <p className="bo-notice bo-notice--warn bo-wrap">{T.truncated}</p>}
      <SimpleTable
        caption={T.title}
        columns={[
          { label: C.occurredAt },
          { label: C.kind },
          { label: C.order },
          { label: C.device },
          { label: C.printer },
          { label: C.error },
          { label: C.attempts, numeric: true },
        ]}
        rows={answer.failures.map((failure) => ({
          key: failure.jobId,
          cells: [
            formatDateTime(failure.occurredAt),
            T.kinds[failure.kind] ?? failure.kind,
            T.order(failure.deviceOrderNo, failure.callNumber),
            T.device(failure.deviceId),
            failure.printerKey,
            failure.errorCode,
            String(failure.attempts),
          ],
          data: { "data-print-job": failure.jobId },
        }))}
        empty={T.empty}
      />
    </div>
  );
}

/** Slips the branch's tills failed to print in the chosen days and never printed since. */
export function PrintFailuresScreen() {
  const api = useApi();
  const { branch } = useSession();
  const branchId = branch?.id ?? null;
  const [fromDate, setFromDate] = useState(() => todaysBusinessDate());
  const [toDate, setToDate] = useState(() => todaysBusinessDate());
  const range = shopDaysWindow(fromDate, toDate);
  const from = range?.from ?? null;
  const to = range?.to ?? null;
  const load = useMemo(
    () => (branchId === null || from === null || to === null ? null : () => api.getPrintFailures(branchId, from, to)),
    [api, branchId, from, to],
  );
  const [loaded, reload] = useApiLoad(load);

  return (
    <section className="bo-stack" aria-labelledby="print-failures-title">
      <h1 id="print-failures-title" className="bo-title">
        {T.title}
      </h1>
      <p className="bo-muted bo-wrap">{T.hint}</p>
      <div className="bo-row">
        <TextField label={T.fromLabel} type="date" value={fromDate} onChange={setFromDate} />
        <TextField label={T.toLabel} type="date" value={toDate} onChange={setToDate} />
      </div>
      {range === null && <p className="bo-notice bo-notice--error bo-wrap" role="alert">{T.rangeInvalid}</p>}
      {branchId === null ? (
        <p className="bo-muted">{vi.devices.chooseBranch}</p>
      ) : (
        range !== null && (
          <LoadStateView loaded={loaded} retry={reload}>
            {(answer) => <PrintFailuresTable answer={answer} />}
          </LoadStateView>
        )
      )}
    </section>
  );
}
