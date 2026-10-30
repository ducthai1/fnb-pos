"use client";

import { ChefHat, Pencil, Trash2 } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import type { ApiFailure } from "../../lib/api/api-result";
import type { Station } from "../../lib/api/catalog-api";
import { failureMessage, isSignedOut } from "../../lib/errors/failure-message";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { LoadStateView } from "../shell/load-state-view";
import { PageHeader } from "../shell/page-header";
import { useSession } from "../shell/session-context";
import { useApiLoad } from "../shell/use-api-load";
import { ConfirmPanel } from "../ui/confirm-panel";
import { EmptyState } from "../ui/empty-state";
import { ErrorNotice, SuccessNotice } from "../ui/error-notice";
import { Icon } from "../ui/icon";
import { TextField } from "../ui/text-field";
import { newId } from "./product-editor/product-draft";

const T = vi.stations;
const NAME_MAX = 120;

function nameProblem(name: string): string | undefined {
  if (name.trim() === "") return vi.common.nameMissing;
  if (name.trim().length > NAME_MAX) return vi.common.nameTooLong(NAME_MAX);
  return undefined;
}

/** The stations of the branch being looked at: add, rename, and delete one nothing uses. */
export function StationsScreen() {
  const api = useApi();
  const { branch, signedOut } = useSession();
  const branchId = branch?.id ?? null;
  const load = useMemo(() => (branchId === null ? null : () => api.listStations(branchId)), [api, branchId]);
  const [loaded, reload, refresh] = useApiLoad(load);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [renameError, setRenameError] = useState<string | undefined>(undefined);
  const [asking, setAsking] = useState<Station | null>(null);
  const [busy, setBusy] = useState(false);

  const report = (result: ApiFailure, own?: string) => {
    if (isSignedOut(result)) signedOut();
    if (result.status === 409 && result.code === "API_CATALOG_VERSION_CONFLICT") {
      setFailure(T.conflict);
      setRenaming(null);
      return refresh();
    }
    setFailure(own ?? failureMessage(result));
  };

  async function add(event: FormEvent) {
    event.preventDefault();
    setDone(null);
    setFailure(null);
    const problem = nameProblem(name);
    setNameError(problem);
    if (problem !== undefined || branchId === null) return;
    const result = await api.putStation(newId(), { version: null, branchId, name: name.trim() });
    if (!result.ok) return report(result);
    setName("");
    setDone(T.added(result.value.name));
    refresh();
  }

  async function rename(station: Station, newName: string) {
    setDone(null);
    setFailure(null);
    const problem = nameProblem(newName);
    setRenameError(problem);
    if (problem !== undefined) return;
    const result = await api.putStation(station.id, { version: station.version, branchId: station.branchId, name: newName.trim() });
    if (!result.ok) return report(result);
    setRenaming(null);
    setDone(T.renamed(result.value.name));
    refresh();
  }

  async function remove(station: Station) {
    setBusy(true);
    setFailure(null);
    const result = await api.deleteStation(station.id, station.version);
    setBusy(false);
    setAsking(null);
    if (!result.ok) return report(result, result.code === "API_CATALOG_IN_USE" ? T.inUse : undefined);
    setDone(T.deleted(station.name));
    refresh();
  }

  return (
    <section className="bo-stack" aria-labelledby="stations-title">
      <PageHeader section="/menu/stations" title={T.title} titleId="stations-title" hint={branch === null ? vi.menu.chooseBranch : T.hint} />
      <ErrorNotice message={failure} />
      <SuccessNotice message={done} />
      <LoadStateView loaded={loaded} retry={reload}>
        {(stations) => (
          <>
            <form className="bo-card bo-field-row" onSubmit={(event) => void add(event)} noValidate>
              <TextField label={T.newLabel} value={name} onChange={setName} error={nameError} />
              <button type="submit" className="bo-button bo-button--primary">
                {T.add}
              </button>
            </form>
            {stations.length === 0 && (
              <div className="bo-empty">
                <EmptyState icon={ChefHat}>{T.empty}</EmptyState>
              </div>
            )}
            <ul className="bo-choice-list" aria-label={T.title}>
              {stations.map((station) => (
                <li key={station.id} className="bo-card bo-row bo-station-row">
                  {renaming?.id === station.id ? (
                    <form
                      className="bo-row bo-grow"
                      noValidate
                      onSubmit={(event) => {
                        event.preventDefault();
                        void rename(station, renaming.name);
                      }}
                    >
                      <TextField label={T.nameLabel} value={renaming.name} error={renameError} onChange={(value) => setRenaming({ id: station.id, name: value })} />
                      <button type="submit" className="bo-button bo-button--primary">
                        {vi.common.save}
                      </button>
                      <button type="button" className="bo-button" onClick={() => setRenaming(null)}>
                        {vi.common.cancel}
                      </button>
                    </form>
                  ) : (
                    <>
                      <span className="bo-station-row__icon" aria-hidden="true">
                        <Icon of={ChefHat} size={18} />
                      </span>
                      <span className="bo-wrap bo-grow bo-station-row__name">{station.name}</span>
                      <button type="button" className="bo-button" aria-label={T.renameLabel(station.name)} onClick={() => { setRenameError(undefined); setRenaming({ id: station.id, name: station.name }); }}>
                        <Icon of={Pencil} size={16} />
                        {T.rename}
                      </button>
                      <button type="button" className="bo-button bo-button--danger" aria-label={T.deleteLabel(station.name)} onClick={() => { setDone(null); setAsking(station); }}>
                        <Icon of={Trash2} size={16} />
                        {vi.common.remove}
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
            {asking !== null && (
              <ConfirmPanel
                title={T.deleteTitle(asking.name)}
                hint={T.deleteHint}
                confirmLabel={vi.common.remove}
                busyLabel={T.deleting}
                busy={busy}
                error={null}
                onCancel={() => setAsking(null)}
                onConfirm={() => void remove(asking)}
              />
            )}
          </>
        )}
      </LoadStateView>
    </section>
  );
}
