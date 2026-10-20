import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi as mock } from "vitest";
import { ApiProvider } from "../components/app/api-context";
import { AdminShell } from "../components/shell/admin-shell";
import type { BackofficeApi } from "../lib/api/backoffice-api";
import { vi } from "../messages/vi";
import { fakeBackofficeApi } from "./fake-backoffice-api";

/**
 * A screen inside the real frame (session check, branches), signed in as the owner with
 * the first branch picked, on an API that answers as `overrides` say.
 */
export async function renderSignedIn(page: ReactNode, overrides: Partial<BackofficeApi> = {}) {
  const onSignedOut = mock.fn();
  const api = fakeBackofficeApi(overrides);
  const view = render(
    <ApiProvider api={api}>
      <AdminShell renderNav={() => null} onSignedOut={onSignedOut}>
        {page}
      </AdminShell>
    </ApiProvider>,
  );
  // The branch select shows only once the session and the branches are in.
  await screen.findByLabelText(vi.shell.branchLabel);
  return { ...view, api, onSignedOut };
}
