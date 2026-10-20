"use client";

import {
  CalendarCheck,
  CircleCheck,
  type LucideIcon,
  PrinterX,
  QrCode,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ApiResult } from "../../lib/api/api-result";
import {
  dayBefore,
  formatBusinessDate,
  shopDaysWindow,
  todaysBusinessDate,
} from "../../lib/format/business-day";
import { isPermissionDenied } from "../../lib/errors/failure-message";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { Icon } from "../ui/icon";

const T = vi.home;

interface Todo {
  readonly key: string;
  readonly text: string;
  readonly href: string;
  readonly icon: LucideIcon;
  readonly tone: "danger" | "warn" | "info";
}

type Check = Todo | "clear" | "failed" | "denied";

const failedOr = <V,>(result: ApiResult<V>, read: (value: V) => Todo | "clear"): Check => {
  if (result.ok) return read(result.value);
  return isPermissionDenied(result) ? "denied" : "failed";
};

/**
 * What a person should see to today, from pages that already exist: QR money owed back,
 * transfers nobody matched, slips that never printed, and yesterday left open (only when
 * something was sold that day). Each line goes to the page where it is done.
 */
export function TodoList({ branchId }: { branchId: string }) {
  const api = useApi();
  const [checks, setChecks] = useState<readonly Check[] | null>(null);

  useEffect(() => {
    let current = true;
    const today = todaysBusinessDate();
    const yesterday = dayBefore(today);
    const window = shopDaysWindow(today, today);
    void Promise.all([
      api.listUnmatched(branchId).then((result): Check[] => {
        if (!result.ok) return [failedOr(result, () => "clear")];
        const { refundDue, transfers } = result.value;
        return [
          refundDue.length === 0
            ? "clear"
            : {
                key: "refund",
                text: T.todo.refundDue(refundDue.length),
                href: "/payments",
                icon: QrCode,
                tone: "danger",
              },
          transfers.length === 0
            ? "clear"
            : {
                key: "match",
                text: T.todo.unmatched(transfers.length),
                href: "/payments",
                icon: TriangleAlert,
                tone: "warn",
              },
        ];
      }),
      window === null
        ? Promise.resolve<Check[]>(["clear"])
        : api
            .getPrintFailures(branchId, window.from, window.to)
            .then((result) => [
              failedOr(result, ({ failures, truncated }) =>
                failures.length === 0
                  ? "clear"
                  : {
                      key: "print",
                      text: T.todo.printFailures(failures.length, truncated),
                      href: "/reports/print-failures",
                      icon: PrinterX,
                      tone: "danger",
                    },
              ),
            ]),
      Promise.all([
        api.getDayStatus(branchId, yesterday),
        api.getDailySales(branchId, yesterday),
      ]).then(([status, sales]) => {
        if (!status.ok) return [failedOr(status, () => "clear")];
        const sold = sales.ok && sales.value.sales.orderCount + sales.value.refunds.orderCount > 0;
        if (status.value.dayClose !== null || !sold) return ["clear"] as Check[];
        return [
          {
            key: "day",
            text: T.todo.dayOpen(formatBusinessDate(yesterday)),
            href: "/day-close",
            icon: CalendarCheck,
            tone: "warn",
          },
        ] as Check[];
      }),
    ]).then((groups) => {
      if (current) setChecks(groups.flat());
    });
    return () => {
      current = false;
    };
  }, [api, branchId]);

  if (checks === null) return <p className="bo-muted bo-loading">{vi.common.loading}</p>;
  const todos = checks.filter((check): check is Todo => typeof check === "object");
  const failed = checks.includes("failed");
  return (
    <div className="bo-stack">
      {todos.length === 0 ? (
        !failed && (
          <p className="bo-todo-clear">
            <Icon of={CircleCheck} />
            {T.todoClear}
          </p>
        )
      ) : (
        <ul className="bo-todos">
          {todos.map((todo) => (
            <li key={todo.key}>
              <Link href={todo.href} className="bo-todo" data-tone={todo.tone}>
                <Icon of={todo.icon} />
                <span className="bo-wrap">{todo.text}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {failed && <p className="bo-muted">{T.todoFailed}</p>}
    </div>
  );
}
