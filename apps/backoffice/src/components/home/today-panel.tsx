"use client";

import { Banknote, ChartColumn, QrCode, ReceiptText, Wallet } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { todaysBusinessDate, vndText } from "../../lib/format/business-day";
import { averageOrder, hourBars, methodNet, topItems } from "../../lib/reports/day-figures";
import { formatVnd } from "@fnb/domain";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { LoadStateView } from "../shell/load-state-view";
import { useApiLoad } from "../shell/use-api-load";
import { Icon } from "../ui/icon";
import { StatCard } from "../ui/stat-card";
import { HourChart } from "./hour-chart";
import { TodoList } from "./todo-list";
import { TopItems } from "./top-items";

const T = vi.home;
const C = T.cards;

/** Today at the branch: four figures, the day by hour, what sold most, what needs doing. */
export function TodayPanel({ branchId }: { branchId: string }) {
  const api = useApi();
  const load = useMemo(() => () => api.getDailySales(branchId, todaysBusinessDate()), [api, branchId]);
  const [loaded, reload] = useApiLoad(load);
  return (
    <div className="bo-home-grid">
      <LoadStateView loaded={loaded} retry={reload}>
        {(report) => {
          const average = averageOrder(report);
          return (
            <>
              <section className="bo-stats" aria-label={T.figuresTitle}>
                <StatCard icon={Wallet} label={C.collected} value={vndText(report.sales.collected)} note={C.collectedNote} figure="collected" />
                <StatCard
                  icon={ReceiptText}
                  tone="info"
                  label={C.orders}
                  value={String(report.sales.orderCount)}
                  note={C.ordersNote(report.cancelledOrders)}
                  figure="orderCount"
                />
                <StatCard
                  icon={ChartColumn}
                  tone="amber"
                  label={C.average}
                  value={average === null ? C.averageNone : formatVnd(average)}
                  figure="average"
                />
                <div className="bo-stat bo-stat--split" data-tone="success">
                  <p className="bo-stat__pair" data-figure="cash">
                    <Icon of={Banknote} />
                    <span className="bo-stat__label">{C.cash}</span>
                    <strong className="bo-wrap">{vndText(methodNet(report, "cash"))}</strong>
                  </p>
                  <p className="bo-stat__pair" data-figure="qr">
                    <Icon of={QrCode} />
                    <span className="bo-stat__label">{C.qr}</span>
                    <strong className="bo-wrap">{vndText(methodNet(report, "qr_transfer"))}</strong>
                  </p>
                  <p className="bo-stat__note">{C.afterRefunds}</p>
                </div>
              </section>
              <section className="bo-card bo-home-hours" aria-labelledby="home-hours-title">
                <h2 id="home-hours-title" className="bo-subtitle">
                  {T.hoursTitle}
                </h2>
                <HourChart bars={hourBars(report.byHour)} id="home-hours-summary" />
              </section>
              <section className="bo-card bo-home-top" aria-labelledby="home-top-title">
                <div className="bo-card__head">
                  <h2 id="home-top-title" className="bo-subtitle">
                    {T.topTitle}
                  </h2>
                  <Link href="/reports/daily-sales" className="bo-text-link">
                    {T.seeReport}
                  </Link>
                </div>
                <TopItems items={topItems(report, 5)} />
              </section>
            </>
          );
        }}
      </LoadStateView>
      <section className="bo-card bo-home-todo" aria-labelledby="home-todo-title">
        <h2 id="home-todo-title" className="bo-subtitle">
          {T.todoTitle}
        </h2>
        <TodoList branchId={branchId} />
      </section>
    </div>
  );
}
