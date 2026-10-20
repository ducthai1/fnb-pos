"use client";

import { webhookSecretBodySchema } from "@fnb/contracts";
import { type FormEvent, useId, useState } from "react";
import { failureMessage, isSignedOut } from "../../lib/errors/failure-message";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { useSession } from "../shell/session-context";
import { ErrorNotice, SuccessNotice } from "../ui/error-notice";
import { SelectField } from "../ui/select-field";
import { TextField } from "../ui/text-field";

const T = vi.settings.secret;

/** The gateways the server takes notices from, by the key in their webhook path. */
const GATEWAYS = ["sepay", "payos"] as const;

/**
 * A branch's gateway signing secret. Write only: the field is a password field, empties
 * itself once the server has the secret, and nothing on the page ever reads one back.
 */
export function WebhookSecretSection({ branchId }: { branchId: string }) {
  const api = useApi();
  const { signedOut } = useSession();
  const titleId = useId();
  const [gateway, setGateway] = useState<string>(GATEWAYS[0]);
  const [secret, setSecret] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaved(null);
    setError(null);
    const valid = webhookSecretBodySchema.safeParse({ secret }).success;
    setInvalid(!valid);
    if (!valid) return;
    setBusy(true);
    const result = await api.putWebhookSecret(branchId, gateway, secret);
    setBusy(false);
    if (!result.ok) {
      if (isSignedOut(result)) signedOut();
      return setError(failureMessage(result));
    }
    setSecret("");
    setSaved(T.saved(T.gateways[gateway] ?? gateway));
  }

  return (
    <section className="bo-card" aria-labelledby={titleId}>
      <h2 id={titleId} className="bo-subtitle">
        {T.title}
      </h2>
      <p className="bo-muted bo-wrap">{T.hint}</p>
      <form className="bo-stack" onSubmit={(event) => void submit(event)} noValidate>
        <SelectField
          label={T.gateway}
          value={gateway}
          choices={GATEWAYS.map((key) => ({ value: key, label: T.gateways[key] ?? key }))}
          disabled={busy}
          onChange={setGateway}
        />
        <TextField
          label={T.secret}
          type="password"
          autoComplete="new-password"
          value={secret}
          disabled={busy}
          error={invalid ? T.secretInvalid : undefined}
          onChange={setSecret}
        />
        <ErrorNotice message={error} />
        <SuccessNotice message={saved} />
        <button type="submit" className="bo-button bo-button--primary" disabled={busy}>
          {busy ? vi.common.saving : T.save}
        </button>
      </form>
    </section>
  );
}
