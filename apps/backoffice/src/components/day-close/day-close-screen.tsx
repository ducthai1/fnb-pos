"use client";

import { useMemo, useState } from "react";
import { formatBusinessDate, isCalendarDate, todaysBusinessDate } from "../../lib/format/business-day";
import { formatDateTime } from "../../lib/format/format-time";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { LoadStateView } from "../shell/load-state-view";
import { useSession } from "../shell/session-context";
import { useApiLoad } from "../shell/use-api-load";
import { SuccessNotice } from "../ui/error-notice";
import { TextField } from "../ui/text-field";
import { CloseDayPanel } from "./close-day-panel";
import { DayStatusLists } from "./day-status-lists";

const T = vi.dayClose;

/** Where the branch's chosen business day stands, and closing it. */
export function DayCloseScreen() {
  const api = useApi();
  const { branch } = useSession();
  const branchId = branch?.id ?? null;
  const [date, setDate] = useState(() => todaysBusinessDate());
  const [done, setDone] = useState<string | null>(null);
  const valid = isCalendarDate(date);
  const load = useMemo(
    () => (branchId === null || !valid ? null : () => api.getDayStatus(branchId, date)),
    [api, branchId, date, valid],
  );
  const [loaded, reload, refresh] = useApiLoad(load);

  return (
    <section className="bo-stack" aria-labelledby="day-close-title">
      <h1 id="day-close-title" className="bo-title">
        {T.title}
      </h1>
      <p className="bo-muted bo-wrap">{T.hint}</p>
      <div className="bo-row">
        <TextField
          label={T.dateLabel}
          type="date"
          value={date}
          error={valid ? undefined : vi.dailySales.dateInvalid}
          onChange={(next) => {
            setDone(null);
            setDate(next);
          }}
        />
      </div>
      <SuccessNotice message={done} />
      {branchId === null ? (
        <p className="bo-muted">{vi.devices.chooseBranch}</p>
      ) : (
        valid && (
          <LoadStateView loaded={loaded} retry={reload}>
            {(status) => (
              <div className="bo-card bo-stack">
                <p className="bo-subtitle bo-wrap" data-day-state={status.dayClose === null ? "open" : "closed"}>
                  {status.dayClose === null ? T.open : T.closedAt(formatDateTime(status.dayClose.closedAt))}
                </p>
                <DayStatusLists status={status} />
                {status.dayClose === null && (
                  <CloseDayPanel
                    key={`${branchId}:${date}`}
                    branchId={branchId}
                    businessDate={date}
                    onClosed={() => {
                      setDone(T.closedDone(formatBusinessDate(date)));
                      refresh();
                    }}
                    onRefused={refresh}
                  />
                )}
              </div>
            )}
          </LoadStateView>
        )
      )}
    </section>
  );
}
