"use client";

import Link from "next/link";
import { sectionsFor } from "../../lib/navigation/admin-sections";
import { vi } from "../../messages/vi";
import { useSession } from "./session-context";

export function HomeScreen() {
  const { user } = useSession();
  return (
    <section className="bo-stack">
      <h1 className="bo-title bo-wrap">{vi.shell.welcome(user.displayName ?? "")}</h1>
      <ul className="bo-home-links">
        {sectionsFor(user.permissionKeys).map((section) => (
          <li key={section.href}>
            <Link href={section.href} className="bo-card bo-home-link">
              {section.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
