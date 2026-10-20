"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { sectionOf } from "../../lib/navigation/admin-sections";
import { vi } from "../../messages/vi";

const T = vi.shell;

export interface Crumb {
  readonly label: string;
  readonly href?: string;
}

/**
 * The head of a page: where it sits (home › group › page), its title, a line of help and
 * the page's own actions on the right (below the title on a phone). `section` is the side
 * menu entry the page belongs to; `trail` adds the steps below it (a product of the menu).
 */
export function PageHeader({
  section,
  title,
  titleId,
  hint,
  actions,
  trail = [],
}: {
  section?: string;
  title: ReactNode;
  titleId?: string;
  hint?: ReactNode;
  actions?: ReactNode;
  trail?: readonly Crumb[];
}) {
  const entry = section === undefined ? null : sectionOf(section);
  const crumbs: Crumb[] = [{ label: T.nav.home, href: "/" }];
  if (entry !== null) {
    crumbs.push({ label: T.groups[entry.group] });
    crumbs.push(trail.length > 0 ? { label: entry.label, href: entry.href } : { label: entry.label });
  }
  crumbs.push(...trail);
  return (
    <header className="bo-page-head">
      <div className="bo-page-head__text">
        {entry !== null && (
          <ol className="bo-crumbs" aria-label={T.breadcrumb}>
            {crumbs.map((crumb, index) => {
              const last = index === crumbs.length - 1;
              return (
                <li key={`${index}-${crumb.label}`} className="bo-wrap">
                  {crumb.href !== undefined && !last ? (
                    <Link href={crumb.href}>{crumb.label}</Link>
                  ) : (
                    <span aria-current={last ? "page" : undefined}>{crumb.label}</span>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        <h1 id={titleId} className="bo-title bo-wrap">
          {title}
        </h1>
        {hint !== undefined && <p className="bo-muted bo-wrap">{hint}</p>}
      </div>
      {actions !== undefined && <div className="bo-page-head__actions">{actions}</div>}
    </header>
  );
}
