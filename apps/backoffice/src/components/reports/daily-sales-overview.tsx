import { formatVnd } from "@fnb/domain";
import { Ban, ChartColumn, ReceiptText, TicketPercent, Undo2, Wallet } from "lucide-react";
import type { DailySalesReport } from "../../lib/api/reports-api";
import { vndText } from "../../lib/format/business-day";
import { averageOrder, hourBars } from "../../lib/reports/day-figures";
import { vi } from "../../messages/vi";
import { HourChart } from "../home/hour-chart";
import { StatCard } from "../ui/stat-card";

const T = vi.dailySales;
const C = T.cards;

/** The day at a glance over the report's tables: six figures and the takings by hour. */
export function DailySalesOverview({ report }: { report: DailySalesReport }) {
  const { sales, refunds, voids } = report;
  const average = averageOrder(report);
  return (
    <>
      <section className="bo-stats bo-stats--six" aria-label={T.overviewTitle}>
        <StatCard
          icon={Wallet}
          label={C.collected}
          value={vndText(sales.collected)}
          figure="collected"
        />
        <StatCard
          icon={ReceiptText}
          tone="info"
          label={C.orders}
          value={String(sales.orderCount)}
          note={C.cancelled(report.cancelledOrders)}
          figure="orderCount"
        />
        <StatCard
          icon={ChartColumn}
          tone="amber"
          label={C.average}
          value={average === null ? C.averageNone : formatVnd(average)}
          figure="average"
        />
        <StatCard
          icon={TicketPercent}
          tone="amber"
          label={C.discount}
          value={vndText(sales.discount)}
          note={C.discountNote(vndText(sales.gross))}
          figure="discount"
        />
        <StatCard
          icon={Undo2}
          tone="info"
          label={C.refunds}
          value={vndText(refunds.collected)}
          note={C.refundsNote(refunds.orderCount)}
          figure="refunds"
        />
        <StatCard
          icon={Ban}
          tone="amber"
          label={C.voids}
          value={vndText(voids.value)}
          note={C.voidsNote(voids.count)}
          figure="voids"
        />
      </section>
      <section className="bo-card" aria-labelledby="daily-hours-title">
        <h2 id="daily-hours-title" className="bo-subtitle">
          {T.chartTitle}
        </h2>
        <HourChart bars={hourBars(report.byHour)} id="daily-hours-summary" />
      </section>
    </>
  );
}
