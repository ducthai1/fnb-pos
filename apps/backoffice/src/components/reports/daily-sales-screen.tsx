"use client";

import { useMemo, useState } from "react";
import { isCalendarDate, todaysBusinessDate } from "../../lib/format/business-day";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { LoadStateView } from "../shell/load-state-view";
import { PageHeader } from "../shell/page-header";
import { useSession } from "../shell/session-context";
import { useApiLoad } from "../shell/use-api-load";
import { DayPicker } from "../ui/day-picker";
import { DailySalesOverview } from "./daily-sales-overview";
import { DailySalesTables } from "./daily-sales-tables";

const T = vi.dailySales;

/** The sales of the branch's chosen business day, as the server's report defines them. */
export function DailySalesScreen() {
  const api = useApi();
  const { branch } = useSession();
  const branchId = branch?.id ?? null;
  const [date, setDate] = useState(() => todaysBusinessDate());
  const valid = isCalendarDate(date);
  const load = useMemo(
    () => (branchId === null || !valid ? null : () => api.getDailySales(branchId, date)),
    [api, branchId, date, valid],
  );
  const [loaded, reload] = useApiLoad(load);

  return (
    <section className="bo-stack" aria-labelledby="daily-sales-title">
      <PageHeader
        section="/reports/daily-sales"
        title={T.title}
        titleId="daily-sales-title"
        hint={T.hint}
        actions={
          <DayPicker
            label={T.dateLabel}
            value={date}
            error={valid ? undefined : T.dateInvalid}
            onChange={setDate}
          />
        }
      />
      {branchId === null ? (
        <p className="bo-muted">{vi.devices.chooseBranch}</p>
      ) : (
        valid && (
          <LoadStateView loaded={loaded} retry={reload}>
            {(report) => (
              <>
                <DailySalesOverview report={report} />
                <DailySalesTables report={report} />
              </>
            )}
          </LoadStateView>
        )
      )}
    </section>
  );
}
