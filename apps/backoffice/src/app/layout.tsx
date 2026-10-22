import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ApiProvider } from "../components/app/api-context";
import { ThemeFollower } from "../components/app/theme-follower";
import { THEME_BOOT_SCRIPT } from "../lib/theme/theme-choice";
import { vi } from "../messages/vi";
// Bundled, only the two subsets the shop writes in: Vietnamese (every mark, "đ", "₫") and Latin.
import "@fontsource/be-vietnam-pro/vietnamese-400.css";
import "@fontsource/be-vietnam-pro/latin-400.css";
import "@fontsource/be-vietnam-pro/vietnamese-500.css";
import "@fontsource/be-vietnam-pro/latin-500.css";
import "@fontsource/be-vietnam-pro/vietnamese-600.css";
import "@fontsource/be-vietnam-pro/latin-600.css";
import "@fontsource/be-vietnam-pro/vietnamese-700.css";
import "@fontsource/be-vietnam-pro/latin-700.css";
import "./backoffice-tokens.css";
import "./backoffice-base.css";
import "./backoffice-shell.css";
import "./backoffice-topnav.css";
import "./backoffice-nav-drawer.css";
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
import "./backoffice-product-photo.css";
import "./backoffice-menu-import.css";
import "./backoffice-menu-bulk.css";
import "./backoffice-settings.css";
import "./backoffice-login.css";
import "./backoffice-motion.css";
import "./backoffice-listbox.css";
import "./backoffice-pager.css";
import "./backoffice-theme-picker.css";

export const metadata: Metadata = { title: vi.shell.appName };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The head's script sets the look on <html> before the first paint; React then finds
    // attributes the server did not write, which is expected there and only there.
    <html lang="vi" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <ThemeFollower />
        <ApiProvider>{children}</ApiProvider>
      </body>
    </html>
  );
}
