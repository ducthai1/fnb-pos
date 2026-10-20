"use client";

import { type FormEvent, useState } from "react";
import type { Organization } from "../../lib/api/auth-api";
import { failureMessage } from "../../lib/errors/failure-message";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { useHydrated } from "../app/use-hydrated";
import { ErrorNotice } from "../ui/error-notice";

const T = vi.login;

/**
 * Email or phone and a password. An account in several organizations is answered with the
 * list (the password was already right), and signs in again with the one picked.
 */
export function LoginForm({ onSignedIn }: { onSignedIn: () => void }) {
  const api = useApi();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [organizations, setOrganizations] = useState<readonly Organization[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hydrated = useHydrated();

  async function signIn(organizationId?: string) {
    setBusy(true);
    setError(null);
    const outcome = await api.login({
      identifier,
      password,
      ...(organizationId === undefined ? {} : { organizationId }),
    });
    setBusy(false);
    if (outcome.kind === "signed-in") return onSignedIn();
    if (outcome.kind === "choose-organization") return setOrganizations(outcome.organizations);
    setError(failureMessage(outcome.failure));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (identifier.trim() === "") return setError(T.identifierMissing);
    if (password === "") return setError(T.passwordMissing);
    void signIn();
  }

  if (organizations !== null) {
    return (
      <section className="bo-card bo-login" aria-labelledby="choose-organization">
        <h1 id="choose-organization" className="bo-title">
          {T.chooseOrganizationTitle}
        </h1>
        <p className="bo-muted">{T.chooseOrganizationHint}</p>
        <ul className="bo-choice-list">
          {organizations.map((organization) => (
            <li key={organization.id}>
              <button
                type="button"
                className="bo-button bo-button--block bo-wrap"
                disabled={busy}
                aria-label={T.enterOrganization(organization.name)}
                onClick={() => void signIn(organization.id)}
              >
                {organization.name}
              </button>
            </li>
          ))}
        </ul>
        <ErrorNotice message={error} />
        <button
          type="button"
          className="bo-link-button"
          onClick={() => {
            setOrganizations(null);
            setPassword("");
            setError(null);
          }}
        >
          {T.back}
        </button>
      </section>
    );
  }

  return (
    <form className="bo-card bo-login" onSubmit={submit} noValidate data-hydrated={hydrated || undefined}>
      <h1 className="bo-title">{T.title}</h1>
      <label className="bo-field">
        <span>{T.identifierLabel}</span>
        <input
          className="bo-input"
          name="identifier"
          autoComplete="username"
          inputMode="email"
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
        />
      </label>
      <label className="bo-field">
        <span>{T.passwordLabel}</span>
        <input
          className="bo-input"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <ErrorNotice message={error} />
      <button type="submit" className="bo-button bo-button--primary" disabled={busy}>
        {busy ? T.submitting : T.submit}
      </button>
    </form>
  );
}
