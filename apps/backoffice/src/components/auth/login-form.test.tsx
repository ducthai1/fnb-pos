import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi as mock } from "vitest";
import type { LoginInput, LoginOutcome } from "../../lib/api/auth-api";
import { vi } from "../../messages/vi";
import { fakeBackofficeApi, refused } from "../../test-support/fake-backoffice-api";
import { ApiProvider } from "../app/api-context";
import { LoginForm } from "./login-form";

const T = vi.login;

function renderLogin(answer: (input: LoginInput) => LoginOutcome) {
  const login = mock.fn(async (input: LoginInput) => answer(input));
  const onSignedIn = mock.fn();
  render(
    <ApiProvider api={fakeBackofficeApi({ login })}>
      <LoginForm onSignedIn={onSignedIn} />
    </ApiProvider>,
  );
  return { login, onSignedIn };
}

function fillAndSubmit(identifier: string, password: string) {
  fireEvent.change(screen.getByLabelText(T.identifierLabel), { target: { value: identifier } });
  fireEvent.change(screen.getByLabelText(T.passwordLabel), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: T.submit }));
}

describe("signing in to the backoffice", () => {
  it("signs in with an email and a password", async () => {
    const { login, onSignedIn } = renderLogin(() => ({ kind: "signed-in" }));
    fillAndSubmit("chu@quan.vn", "Mật khẩu đúng");
    await mock.waitFor(() => expect(onSignedIn).toHaveBeenCalledOnce());
    expect(login).toHaveBeenCalledWith({ identifier: "chu@quan.vn", password: "Mật khẩu đúng" });
  });

  it("refuses a wrong password with the API's sentence and stays on the form", async () => {
    const { onSignedIn } = renderLogin(() => ({
      kind: "failed",
      failure: refused(401, "API_AUTH_INVALID_CREDENTIALS"),
    }));
    fillAndSubmit("0912345678", "sai");
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      vi.errors.byCode.API_AUTH_INVALID_CREDENTIALS,
    );
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it("does not call the API without an identifier or a password", () => {
    const { login } = renderLogin(() => ({ kind: "signed-in" }));
    fillAndSubmit("  ", "x");
    expect(screen.getByRole("alert").textContent).toBe(T.identifierMissing);
    fillAndSubmit("chu@quan.vn", "");
    expect(screen.getByRole("alert").textContent).toBe(T.passwordMissing);
    expect(login).not.toHaveBeenCalled();
  });

  it("lets an account of several organizations pick one, and signs in to that one", async () => {
    const organizations = [
      { id: "0190a000-0000-7000-8000-00000000000a", name: "Trà Sáng" },
      { id: "0190a000-0000-7000-8000-00000000000b", name: "Phở Chiều" },
    ];
    const { login, onSignedIn } = renderLogin((input) =>
      input.organizationId === undefined
        ? { kind: "choose-organization", organizations }
        : { kind: "signed-in" },
    );
    fillAndSubmit("chu@quan.vn", "Mật khẩu đúng");
    await screen.findByRole("heading", { name: T.chooseOrganizationTitle });
    expect(onSignedIn).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: T.enterOrganization("Phở Chiều") }));
    await mock.waitFor(() => expect(onSignedIn).toHaveBeenCalledOnce());
    expect(login).toHaveBeenLastCalledWith({
      identifier: "chu@quan.vn",
      password: "Mật khẩu đúng",
      organizationId: organizations[1]?.id,
    });
  });
});
