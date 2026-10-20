import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi as mock } from "vitest";
import type { BackofficeApi } from "../../lib/api/backoffice-api";
import { vi } from "../../messages/vi";
import { BRANCHES, fakeBackofficeApi, ok, refused } from "../../test-support/fake-backoffice-api";
import { ApiProvider } from "../app/api-context";
import { AdminShell } from "./admin-shell";
import { LoadStateView } from "./load-state-view";
import { useSession } from "./session-context";
import { useApiLoad } from "./use-api-load";

const T = vi.shell;

function BranchProbe() {
  const { branch } = useSession();
  return <p data-testid="branch">{branch?.name ?? "none"}</p>;
}

function renderShell(overrides: Partial<BackofficeApi>, page = <BranchProbe />) {
  const onSignedOut = mock.fn();
  const api = fakeBackofficeApi(overrides);
  render(
    <ApiProvider api={api}>
      <AdminShell renderNav={() => <a href="/devices">nav</a>} onSignedOut={onSignedOut}>
        {page}
      </AdminShell>
    </ApiProvider>,
  );
  return { onSignedOut, api };
}

beforeEach(() => window.localStorage.clear());

describe("the frame of every signed-in page", () => {
  it("sends a visitor without a session to sign in and shows nothing of the page", async () => {
    const { onSignedOut } = renderShell({ me: async () => refused(401, "API_AUTH_UNAUTHENTICATED") });
    await mock.waitFor(() => expect(onSignedOut).toHaveBeenCalledOnce());
    expect(screen.queryByTestId("branch")).toBeNull();
  });

  it("offers a retry, not a sign-in page, when the session check itself fails", async () => {
    const me = mock.fn(async () => refused(null));
    const { onSignedOut } = renderShell({ me });
    expect((await screen.findByRole("alert")).textContent).toBe(vi.errors.network);
    expect(onSignedOut).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: T.retry }));
    await mock.waitFor(() => expect(me).toHaveBeenCalledTimes(2));
  });

  it("shows the first branch, switches branch, and remembers the switch", async () => {
    renderShell({});
    await mock.waitFor(() => expect(screen.getByTestId("branch").textContent).toBe("Q1"));
    fireEvent.change(screen.getByLabelText(T.branchLabel), { target: { value: BRANCHES[1]?.id } });
    expect(screen.getByTestId("branch").textContent).toBe("Q3");
    expect(window.localStorage.getItem("fnb.backoffice.branchId")).toBe(BRANCHES[1]?.id);
  });

  it("starts on the remembered branch, unless it no longer exists", async () => {
    window.localStorage.setItem("fnb.backoffice.branchId", BRANCHES[1]?.id ?? "");
    renderShell({});
    await mock.waitFor(() => expect(screen.getByTestId("branch").textContent).toBe("Q3"));
    window.localStorage.setItem("fnb.backoffice.branchId", "gone");
    renderShell({});
    await mock.waitFor(() => expect(screen.getAllByTestId("branch")[1]?.textContent).toBe("Q1"));
  });

  it("folds the menu behind a button that says whether it is open", async () => {
    renderShell({});
    const toggle = await screen.findByRole("button", { name: T.openMenu });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: T.closeMenu }).getAttribute("aria-expanded")).toBe("true");
  });

  it("logs out on the server before leaving", async () => {
    const logout = mock.fn(async () => ok(true as const));
    const { onSignedOut } = renderShell({ logout });
    fireEvent.click(await screen.findByRole("button", { name: T.logout }));
    await mock.waitFor(() => expect(onSignedOut).toHaveBeenCalledOnce());
    expect(logout).toHaveBeenCalledOnce();
  });
});

function DeniedPage() {
  const [loaded, retry] = useApiLoad(async () => refused(403, "API_PERMISSION_DENIED"));
  return (
    <LoadStateView loaded={loaded} retry={retry}>
      {() => <p>secret</p>}
    </LoadStateView>
  );
}

function BrokenPage() {
  const [loaded, retry] = useApiLoad(async () => refused(500, "API_INTERNAL"));
  return (
    <LoadStateView loaded={loaded} retry={retry}>
      {() => <p>secret</p>}
    </LoadStateView>
  );
}

describe("a page the role may not see", () => {
  it("says the role lacks the permission instead of showing an error", async () => {
    renderShell({}, <DeniedPage />);
    await screen.findByRole("heading", { name: T.permissionDeniedTitle });
    expect(screen.queryByText("secret")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows any other failure as an error with a retry", async () => {
    renderShell({}, <BrokenPage />);
    expect((await screen.findByRole("alert")).textContent).toBe(vi.errors.byCode.API_INTERNAL);
    expect(screen.queryByRole("heading", { name: T.permissionDeniedTitle })).toBeNull();
  });
});
