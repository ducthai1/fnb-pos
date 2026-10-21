import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ApiProvider } from "../components/app/api-context";
import { vi } from "../messages/vi";
import "@fontsource/be-vietnam-pro/400.css";
import "@fontsource/be-vietnam-pro/500.css";
import "@fontsource/be-vietnam-pro/600.css";
import "@fontsource/be-vietnam-pro/700.css";
import "./backoffice-tokens.css";
import "./backoffice-base.css";
import "./backoffice-shell.css";
import "./backoffice-sidenav.css";
import "./backoffice-controls.css";
import "./backoffice-float-field.css";
import "./backoffice-checks.css";
import "./backoffice-page.css";
import "./backoffice-stats.css";
import "./backoffice-hours-chart.css";
import "./backoffice-home.css";
import "./backoffice-home-links.css";
import "./backoffice-report.css";
import "./backoffice-day-close.css";
import "./backoffice-floor-plan.css";
import "./backoffice-notices.css";
import "./backoffice-states.css";
import "./backoffice-tabs.css";
import "./backoffice-filter-card.css";
import "./backoffice-table.css";
import "./backoffice-data-table.css";
import "./backoffice-row-panel.css";
import "./backoffice-cells.css";
import "./backoffice-people.css";
import "./backoffice-menu.css";
import "./backoffice-menu-import.css";
import "./backoffice-menu-bulk.css";
import "./backoffice-settings.css";
import "./backoffice-login.css";

export const metadata: Metadata = { title: vi.shell.appName };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <ApiProvider>{children}</ApiProvider>
      </body>
    </html>
  );
}
