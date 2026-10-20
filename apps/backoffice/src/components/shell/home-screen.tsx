"use client";

import Link from "next/link";
import { formatBusinessDate, todaysBusinessDate } from "../../lib/format/business-day";
import { sectionsFor } from "../../lib/navigation/admin-sections";
import { vi } from "../../messages/vi";
import { TodayPanel } from "../home/today-panel";
import { Icon } from "../ui/icon";
import { PageHeader } from "./page-header";
import { SECTION_ICONS } from "./section-icons";
import { useSession } from "./session-context";

const T = vi.home;

/**
 * The first page after signing in. A member who may read reports sees today at the branch
 * (figures, the day by hour, best sellers, what needs doing); everyone gets the pages their
 * keys open as shortcuts.
 */
export function HomeScreen() {
  const { user, branch } = useSession();
  const today = formatBusinessDate(todaysBusinessDate());
  const reports = user.permissionKeys.includes("view_reports");
  return (
    <section className="bo-stack bo-home">
      <PageHeader
        title={vi.shell.welcome(user.displayName ?? "")}
        hint={branch === null ? T.todayNoBranch(today) : T.today(today, branch.name)}
      />
      {reports && branch !== null && <TodayPanel branchId={branch.id} />}
      <section className="bo-card" aria-labelledby="home-shortcuts-title">
        <h2 id="home-shortcuts-title" className="bo-subtitle">
          {T.shortcutsTitle}
        </h2>
        <ul className="bo-home-links">
          {sectionsFor(user.permissionKeys).map((section) => {
            const glyph = SECTION_ICONS[section.href];
            return (
              <li key={section.href}>
                <Link href={section.href} className="bo-home-link">
                  {glyph && <Icon of={glyph} size={20} />}
                  <span className="bo-wrap">{section.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </section>
  );
}
