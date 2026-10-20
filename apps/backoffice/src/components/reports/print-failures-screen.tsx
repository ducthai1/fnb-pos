"use client";

import { PrinterCheck } from "lucide-react";
import { useMemo, useState } from "react";
import type { PrintFailures } from "../../lib/api/reports-api";
import { firstOfLastDays, shopDaysWindow, todaysBusinessDate } from "../../lib/format/business-day";
import { formatDateTime } from "../../lib/format/format-time";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { LoadStateView } from "../shell/load-state-view";
import { PageHeader } from "../shell/page-header";
import { useSession } from "../shell/session-context";
import { useApiLoad } from "../shell/use-api-load";
import { type DataColumn, DataTable } from "../ui/data-table";
import { EmptyState } from "../ui/empty-state";
import { TextField } from "../ui/text-field";

const T = vi.printFailures;
const C = T.columns;

type Failure = PrintFailures["failures"][number];

/** The ranges a tap picks, each ending today. */
const RANGES = [
  { key: "today", days: 1 },
  { key: "week", days: 7 },
  { key: "month", days: 30 },
] as const;

const kindName = (failure: Failure) => T.kinds[failure.kind] ?? failure.kind;

const COLUMNS: readonly DataColumn<Failure>[] = [
  {
    key: "occurredAt",
    label: C.occurredAt,
    // A time and a date on one line ("04:21 21/10/2026"), not cut in the middle of the year.
    width: "140px",
    cell: (failure) => formatDateTime(failure.occurredAt),
    sortValue: (failure) => failure.occurredAt,
  },
  {
    key: "kind",
    label: C.kind,
    cell: (failure) => (
      <span className="bo-badge" data-tone={failure.kind === "bill" ? "danger" : "warn"}>
        {kindName(failure)}
      </span>
    ),
    sortValue: kindName,
  },
  {
    key: "order",
    label: C.order,
    cell: (failure) => T.order(failure.deviceOrderNo, failure.callNumber),
    sortValue: (failure) => failure.deviceOrderNo,
  },
  { key: "device", label: C.device, cell: (failure) => T.device(failure.deviceId) },
  {
    key: "printer",
    label: C.printer,
    cell: (failure) => failure.printerKey,
    sortValue: (failure) => failure.printerKey,
  },
  {
    key: "error",
    label: C.error,
    cell: (failure) => <code className="bo-code">{failure.errorCode}</code>,
  },
  {
    key: "attempts",
    label: C.attempts,
    numeric: true,
    width: "96px",
    cell: (failure) => String(failure.attempts),
    sortValue: (failure) => failure.attempts,
  },
];

/** The kinds of slip on the list, one filter each, in the order the kinds are named. */
const kindFilters = (failures: readonly Failure[]) =>
  Object.keys(T.kinds)
    .filter((kind) => failures.some((failure) => failure.kind === kind))
    .map((kind) => ({
      key: kind,
      label: T.kinds[kind] ?? kind,
      test: (failure: Failure) => failure.kind === kind,
    }));

function PrintFailuresTable({ answer }: { answer: PrintFailures }) {
  return (
    <div className="bo-stack">
      {answer.truncated && <p className="bo-notice bo-notice--warn bo-wrap">{T.truncated}</p>}
      <DataTable
        label={T.title}
        rows={answer.failures}
        rowKey={(failure) => failure.jobId}
        rowData={(failure) => ({ "data-print-job": failure.jobId })}
        columns={COLUMNS}
        search={{
          label: T.search,
          text: (failure) =>
            [
              failure.printerKey,
              T.order(failure.deviceOrderNo, failure.callNumber),
              failure.errorCode,
            ].join(" "),
        }}
        filters={kindFilters(answer.failures)}
        initialSort={{ key: "occurredAt", direction: "desc" }}
        empty={<EmptyState icon={PrinterCheck}>{T.empty}</EmptyState>}
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
    () =>
      branchId === null || from === null || to === null
        ? null
        : () => api.getPrintFailures(branchId, from, to),
    [api, branchId, from, to],
  );
  const [loaded, reload] = useApiLoad(load);

  return (
    <section className="bo-stack" aria-labelledby="print-failures-title">
      <PageHeader
        section="/reports/print-failures"
        title={T.title}
        titleId="print-failures-title"
        hint={T.hint}
      />
      <div className="bo-row">
        <TextField label={T.fromLabel} type="date" value={fromDate} onChange={setFromDate} />
        <TextField label={T.toLabel} type="date" value={toDate} onChange={setToDate} />
        <div className="bo-tabs" role="group" aria-label={T.rangesLabel}>
          {RANGES.map(({ key, days }) => {
            const today = todaysBusinessDate();
            const first = firstOfLastDays(today, days);
            return (
              <button
                key={key}
                type="button"
                className="bo-tab"
                aria-pressed={fromDate === first && toDate === today}
                onClick={() => {
                  setFromDate(first);
                  setToDate(today);
                }}
              >
                {T.ranges[key]}
              </button>
            );
          })}
        </div>
      </div>
      {range === null && (
        <p className="bo-notice bo-notice--error bo-wrap" role="alert">
          {T.rangeInvalid}
        </p>
      )}
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
