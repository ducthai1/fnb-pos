"use client";

import { type WalletAccounts, walletAccountBodySchema } from "@fnb/contracts";
import { type FormEvent, useCallback, useEffect, useId, useState } from "react";
import { failureMessage, isSignedOut } from "../../lib/errors/failure-message";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { useSession } from "../shell/session-context";
import { ErrorNotice, SuccessNotice } from "../ui/error-notice";
import { TextField } from "../ui/text-field";

const T = vi.settings.wallets;

type Wallet = WalletAccounts["wallets"][number];

/**
 * A branch's e-wallets: each one on or off, and its keys. The keys are write only, like a
 * gateway secret: password fields that empty once saved, and the page only ever learns
 * whether keys are saved. Left empty, the keys already saved stay.
 */
export function WalletAccountSection({ branchId }: { branchId: string }) {
  const api = useApi();
  const { signedOut } = useSession();
  const [wallets, setWallets] = useState<readonly Wallet[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const result = await api.getWallets(branchId);
    if (result.ok) return setWallets(result.value.wallets);
    if (isSignedOut(result)) signedOut();
    setError(failureMessage(result));
  }, [api, branchId, signedOut]);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="bo-card" aria-labelledby={`${branchId}-wallets`} data-wallets>
      <h3 id={`${branchId}-wallets`} className="bo-subtitle">
        {T.title}
      </h3>
      <p className="bo-muted bo-wrap">{T.hint}</p>
      <ErrorNotice message={error} />
      {wallets?.map((wallet) => (
        <WalletForm key={wallet.wallet} branchId={branchId} wallet={wallet} onSaved={load} />
      ))}
    </section>
  );
}

function WalletForm(props: { branchId: string; wallet: Wallet; onSaved(): Promise<void> }) {
  const { wallet } = props;
  const api = useApi();
  const { signedOut } = useSession();
  const switchId = useId();
  const name = T.names[wallet.wallet] ?? wallet.wallet;
  const [enabled, setEnabled] = useState(wallet.enabled);
  const [keys, setKeys] = useState({ appId: "", key1: "", key2: "" });
  const [invalid, setInvalid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const typed = keys.appId !== "" || keys.key1 !== "" || keys.key2 !== "";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaved(null);
    setError(null);
    const body = typed ? { enabled, credentials: keys } : { enabled };
    const parsed = walletAccountBodySchema.safeParse(body);
    const refusal = !parsed.success
      ? /^[0-9]{1,12}$/.test(keys.appId)
        ? T.keyInvalid
        : T.appIdInvalid
      : enabled && !typed && !wallet.saved
        ? T.keysNeeded
        : null;
    setInvalid(refusal);
    if (refusal !== null || !parsed.success) return;
    setBusy(true);
    const result = await api.putWallet(props.branchId, wallet.wallet, parsed.data);
    setBusy(false);
    if (!result.ok) {
      if (isSignedOut(result)) signedOut();
      return setError(failureMessage(result));
    }
    setKeys({ appId: "", key1: "", key2: "" });
    setSaved(T.saved(name));
    await props.onSaved();
  }

  const field = (key: keyof typeof keys, label: string, secret: boolean) => (
    <TextField
      label={label}
      type={secret ? "password" : "text"}
      autoComplete={secret ? "new-password" : "off"}
      inputMode={secret ? undefined : "numeric"}
      value={keys[key]}
      disabled={busy}
      onChange={(value) => setKeys({ ...keys, [key]: value.trim() })}
    />
  );

  return (
    <form
      className="bo-stack"
      data-wallet={wallet.wallet}
      onSubmit={(event) => void submit(event)}
      noValidate
    >
      <label htmlFor={switchId} className="bo-field--inline bo-wrap">
        <input
          id={switchId}
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        {T.turnOn(name)}
      </label>
      <p className="bo-muted" data-wallet-keys={wallet.saved ? "saved" : "missing"}>
        {wallet.saved ? T.keysSaved : T.keysMissing}
      </p>
      {field("appId", T.appId, false)}
      {field("key1", T.key1, true)}
      {field("key2", T.key2, true)}
      <p className="bo-muted bo-wrap">{T.keysHint}</p>
      <ErrorNotice message={invalid ?? error} />
      <SuccessNotice message={saved} />
      <button type="submit" className="bo-button bo-button--primary" disabled={busy}>
        {busy ? vi.common.saving : T.save}
      </button>
    </form>
  );
}
