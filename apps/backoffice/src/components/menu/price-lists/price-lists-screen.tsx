"use client";

import { Pencil, Plus, Tag, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { PriceListSummary } from "../../../lib/api/price-list-api";
import { failureMessage, isSignedOut } from "../../../lib/errors/failure-message";
import { vi } from "../../../messages/vi";
import { useApi } from "../../app/api-context";
import { LoadStateView } from "../../shell/load-state-view";
import { PageHeader } from "../../shell/page-header";
import { useSession } from "../../shell/session-context";
import { useApiLoad } from "../../shell/use-api-load";
import { ConfirmPanel } from "../../ui/confirm-panel";
import { DataTable } from "../../ui/data-table";
import { EmptyState } from "../../ui/empty-state";
import { ErrorNotice, SuccessNotice } from "../../ui/error-notice";
import { Icon } from "../../ui/icon";
import { newId } from "../product-editor/product-draft";

const T = vi.priceLists.list;

/** The brand's price lists: open one to edit its rules, start a new one, or delete one. */
export function PriceListsScreen() {
  const api = useApi();
  const { branch, signedOut } = useSession();
  const brandId = branch?.brandId ?? null;
  const load = useMemo(() => (brandId === null ? null : () => api.listPriceLists(brandId)), [api, brandId]);
  const [loaded, reload, refresh] = useApiLoad(load);
  const [asking, setAsking] = useState<PriceListSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  // Chosen once per visit: the new list's id must not change while the page re-renders.
  const [freshId] = useState(newId);

  async function remove(list: PriceListSummary) {
    setBusy(true);
    setFailure(null);
    const result = await api.deletePriceList(list.id);
    setBusy(false);
    if (!result.ok) {
      if (isSignedOut(result)) signedOut();
      setFailure(failureMessage(result));
      return;
    }
    setAsking(null);
    setDone(T.deleted(list.name));
    refresh();
  }

  return (
    <section className="bo-stack" aria-labelledby="price-lists-title">
      <PageHeader
        section="/menu/price-lists"
        title={T.title}
        titleId="price-lists-title"
        hint={brandId === null ? vi.menu.chooseBranch : T.hint}
        actions={
          brandId === null ? null : (
            <Link className="bo-button bo-button--primary" href={`/menu/price-lists/${freshId}?new=1`}>
              <Icon of={Plus} size={16} />
              {T.add}
            </Link>
          )
        }
      />
      <ErrorNotice message={failure} />
      <SuccessNotice message={done} />
      <LoadStateView loaded={loaded} retry={reload}>
        {(lists) => (
          <>
            <DataTable
              label={T.title}
              rows={lists}
              rowKey={(list) => list.id}
              columns={[
                { key: "name", label: T.columns.name, cell: (list) => <span className="bo-wrap">{list.name}</span>, sortValue: (list) => list.name },
                { key: "rules", label: T.columns.rules, numeric: true, cell: (list) => T.rules(list.itemCount), sortValue: (list) => list.itemCount },
              ]}
              search={{ label: T.search, text: (list) => list.name }}
              initialSort={{ key: "name", direction: "asc" }}
              actionsWidth="260px"
              actions={(list) => (
                <div className="bo-row">
                  <Link className="bo-button" href={`/menu/price-lists/${list.id}`} aria-label={T.edit(list.name)}>
                    <Icon of={Pencil} size={16} />
                    {vi.common.edit}
                  </Link>
                  <button type="button" className="bo-button bo-button--danger" aria-label={T.deleteLabel(list.name)} onClick={() => { setDone(null); setAsking(list); }}>
                    <Icon of={Trash2} size={16} />
                    {vi.common.remove}
                  </button>
                </div>
              )}
              empty={<EmptyState icon={Tag}>{T.empty}</EmptyState>}
            />
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
