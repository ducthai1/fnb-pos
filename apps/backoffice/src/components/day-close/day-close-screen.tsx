"use client";

import { CalendarCheck, CalendarClock } from "lucide-react";
import { useMemo, useState } from "react";
import { formatBusinessDate, isCalendarDate, todaysBusinessDate } from "../../lib/format/business-day";
import { formatDateTime } from "../../lib/format/format-time";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { LoadStateView } from "../shell/load-state-view";
import { PageHeader } from "../shell/page-header";
import { useSession } from "../shell/session-context";
import { useApiLoad } from "../shell/use-api-load";
import { SuccessNotice } from "../ui/error-notice";
import { Icon } from "../ui/icon";
import { DayPicker } from "../ui/day-picker";
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
    <section className="bo-stack bo-report-page" aria-labelledby="day-close-title">
      <PageHeader
        section="/day-close"
        title={T.title}
        titleId="day-close-title"
        hint={T.hint}
        actions={
          <DayPicker
            label={T.dateLabel}
            value={date}
            error={valid ? undefined : vi.dailySales.dateInvalid}
            onChange={(next) => {
              setDone(null);
              setDate(next);
            }}
          />
        }
      />
      <SuccessNotice message={done} />
      {branchId === null ? (
        <p className="bo-muted">{vi.devices.chooseBranch}</p>
      ) : (
        valid && (
          <LoadStateView loaded={loaded} retry={reload}>
            {(status) => (
              <div className="bo-card bo-stack">
                <div className="bo-day-state" data-state={status.dayClose === null ? "open" : "closed"}>
                  <span className="bo-day-state__icon">
                    <Icon of={status.dayClose === null ? CalendarClock : CalendarCheck} size={24} />
                  </span>
                  <div className="bo-stack">
                    <p className="bo-day-state__date">{formatBusinessDate(date)}</p>
                    <p className="bo-subtitle bo-wrap" data-day-state={status.dayClose === null ? "open" : "closed"}>
                      {status.dayClose === null ? T.open : T.closedAt(formatDateTime(status.dayClose.closedAt))}
                    </p>
                  </div>
                </div>
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
