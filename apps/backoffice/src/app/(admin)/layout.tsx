"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useCallback } from "react";
import { AdminShell } from "../../components/shell/admin-shell";
import { renderAdminNav } from "../../components/shell/render-admin-nav";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  // Stable, so the shell does not check the session again on every render.
  const onSignedOut = useCallback(() => {
    const here = `${window.location.pathname}${window.location.search}`;
    router.replace(`/login?next=${encodeURIComponent(here)}`);
  }, [router]);
  return (
    <AdminShell renderNav={renderAdminNav} onSignedOut={onSignedOut}>
      {children}
    </AdminShell>
  );
}
