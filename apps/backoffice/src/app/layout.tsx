import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ApiProvider } from "../components/app/api-context";
import { vi } from "../messages/vi";
import "./backoffice-base.css";
import "./backoffice-controls.css";
import "./backoffice-table.css";
import "./backoffice-people.css";
import "./backoffice-menu.css";
import "./backoffice-settings.css";

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
