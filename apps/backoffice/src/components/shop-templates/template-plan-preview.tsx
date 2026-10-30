"use client";

import { useCallback, useEffect, useState } from "react";
import type { Branch } from "../../lib/api/branch-api";
import type { ShopTemplate, ShopTemplatePlan } from "../../lib/api/shop-template-api";
import { failureMessage, isSignedOut } from "../../lib/errors/failure-message";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { useSession } from "../shell/session-context";
import { ConfirmPanel } from "../ui/confirm-panel";
import { ErrorNotice, SuccessNotice } from "../ui/error-notice";

const T = vi.shopTemplates;
const flagName = (flag: string) => vi.settings.flags[flag] ?? flag;

type Preview = { state: "loading" } | { state: "failed"; message: string } | { state: "ready"; plan: ShopTemplatePlan };

/** What `template` would add to `branch`, as the server sees the branch right now, and the apply step. */
export function TemplatePlanPreview({ template, branch }: { template: ShopTemplate; branch: Branch }) {
  const api = useApi();
  const { signedOut } = useSession();
  const [preview, setPreview] = useState<Preview>({ state: "loading" });
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const fetchPlan = useCallback(async () => {
    const result = await api.getShopTemplatePlan(template.id, branch.id);
    if (result.ok) return setPreview({ state: "ready", plan: result.value });
    if (isSignedOut(result)) signedOut();
    setPreview({ state: "failed", message: failureMessage(result) });
  }, [api, template.id, branch.id, signedOut]);

  useEffect(() => {
    void fetchPlan();
  }, [fetchPlan]);

  async function apply() {
    setBusy(true);
    setFailure(null);
    const result = await api.applyShopTemplate(template.id, branch.id);
    setBusy(false);
    setAsking(false);
    if (!result.ok) {
      if (isSignedOut(result)) signedOut();
      return setFailure(failureMessage(result));
    }
    const count = (kind: string) => result.value.changes.filter((change) => change.kind === kind).length;
    setDone(T.applied(count("add_category"), count("add_station"), count("set_flag")));
    await fetchPlan();
  }

  if (preview.state === "loading") return <p className="bo-muted bo-loading">{T.loadingPreview}</p>;
  if (preview.state === "failed") return <ErrorNotice message={`${T.previewFailed} ${preview.message}`} />;
  const { changes, kept } = preview.plan;
  const categories = changes.flatMap((change) => (change.kind === "add_category" ? [change.name] : []));
  const stations = changes.flatMap((change) => (change.kind === "add_station" ? [change.name] : []));
  const flags = changes.flatMap((change) => (change.kind === "set_flag" ? [change] : []));

  return (
    <section className="bo-card bo-stack" aria-labelledby="template-preview-title">
      <h2 className="bo-subtitle bo-wrap" id="template-preview-title">
        {T.previewTitle(template.name, branch.name)}
      </h2>
      <SuccessNotice message={done} />
      <ErrorNotice message={failure} />
      {changes.length === 0 ? (
        <p className="bo-muted">{T.nothing}</p>
      ) : (
        <div className="bo-stack">
          <h3 className="bo-subtitle">{T.adds}</h3>
          {categories.length > 0 && (
            <div>
              <p className="bo-muted">{T.addsCategories(categories.length)}</p>
              <ul className="bo-chips" aria-label={T.addsCategories(categories.length)}>
                {categories.map((name) => (
                  <li key={name} className="bo-badge bo-wrap">
                    {name}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {stations.length > 0 && (
            <div>
              <p className="bo-muted">{T.addsStations(stations.length)}</p>
              <ul className="bo-chips" aria-label={T.addsStations(stations.length)}>
                {stations.map((name) => (
                  <li key={name} className="bo-badge bo-wrap">
                    {name}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {flags.length > 0 && (
            <div>
              <p className="bo-muted">{T.addsFlags(flags.length)}</p>
              <ul className="bo-template-list" aria-label={T.addsFlags(flags.length)}>
                {flags.map((change) => (
                  <li key={change.flag} className="bo-wrap">
                    {change.value ? T.flagOn(flagName(change.flag)) : T.flagOff(flagName(change.flag))}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {kept.length > 0 && (
        <div className="bo-stack">
          <h3 className="bo-subtitle">{T.keeps}</h3>
          <p className="bo-muted">{T.keepsHint}</p>
          <ul className="bo-template-list" aria-label={T.keeps}>
            {kept.map((entry) => (
              <li key={entry.flag} className="bo-wrap">
                {entry.reason === "locked"
                  ? T.keptLocked(flagName(entry.flag))
                  : (entry.reason === "chosen_by_shop" ? T.keptChosen : T.keptRule)(flagName(entry.flag), entry.current, entry.wanted)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {changes.length > 0 && !asking && (
        <div className="bo-row">
          <button type="button" className="bo-button bo-button--primary" onClick={() => { setDone(null); setAsking(true); }}>
            {T.apply(branch.name)}
          </button>
        </div>
      )}
      {asking && (
        <ConfirmPanel
          tone="change"
          title={T.confirmTitle(template.name, branch.name)}
          hint={T.confirmHint}
          confirmLabel={T.confirm}
          busyLabel={T.applying}
          busy={busy}
          error={null}
          onCancel={() => setAsking(false)}
          onConfirm={() => void apply()}
        />
      )}
    </section>
  );
}
