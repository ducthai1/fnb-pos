"use client";

import { CircleOff } from "lucide-react";
import { useMemo, useState } from "react";
import type { ApiResult } from "../../lib/api/api-result";
import type { ProductSummary } from "../../lib/api/catalog-api";
import { failureMessage, isSignedOut } from "../../lib/errors/failure-message";
import { nameMark } from "../../lib/format/name-mark";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { LoadStateView } from "../shell/load-state-view";
import { PageHeader } from "../shell/page-header";
import { useSession } from "../shell/session-context";
import { useApiLoad } from "../shell/use-api-load";
import { DataTable } from "../ui/data-table";
import { EmptyState } from "../ui/empty-state";
import { ErrorNotice } from "../ui/error-notice";

const T = vi.menu.availability;

interface AvailabilityPage {
  products: ProductSummary[];
  /** Products off at the branch on every channel. */
  soldOut: ReadonlySet<string>;
}

/** Sold out by hand at the branch being looked at, product by product, on all channels. */
export function AvailabilityScreen() {
  const api = useApi();
  const { branch, signedOut } = useSession();
  const branchId = branch?.id ?? null;
  const brandId = branch?.brandId ?? null;
  const load = useMemo(() => {
    if (branchId === null || brandId === null) return null;
    return async (): Promise<ApiResult<AvailabilityPage>> => {
      const [products, soldOut] = await Promise.all([api.listProducts(brandId), api.listSoldOut(branchId)]);
      if (!products.ok) return products;
      if (!soldOut.ok) return soldOut;
      const off = soldOut.value.filter((entry) => entry.channelKey === null).map((entry) => entry.productId);
      return {
        ok: true,
        value: { products: products.value.filter((p) => p.archivedAt === null), soldOut: new Set(off) },
      };
    };
  }, [api, branchId, brandId]);
  const [loaded, reload, refresh] = useApiLoad(load);
  const [pending, setPending] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  async function toggle(productId: string, available: boolean) {
    if (branchId === null) return;
    setPending(productId);
    setFailure(null);
    const result = await api.setAvailable({ productId, branchId, available });
    setPending(null);
    if (!result.ok) {
      if (isSignedOut(result)) signedOut();
      return setFailure(failureMessage(result));
    }
    refresh();
  }

  return (
    <section className="bo-stack" aria-labelledby="availability-title">
      <PageHeader
        section="/menu/availability"
        title={T.title}
        titleId="availability-title"
        hint={branch === null ? vi.menu.chooseBranch : T.hint}
      />
      <ErrorNotice message={failure} />
      <LoadStateView loaded={loaded} retry={reload}>
        {({ products, soldOut }) => (
          <DataTable
            label={T.title}
            rows={products}
            rowKey={(product) => product.id}
            rowData={(product) => ({ "data-sold-out": String(soldOut.has(product.id)) })}
            columns={[
              {
                key: "name",
                label: T.columns.name,
                cell: (product) => (
                  <span className="bo-product-cell">
                    <span className="bo-mark" data-initial={nameMark(product.name)} aria-hidden="true" />
                    <span className="bo-wrap">{product.name}</span>
                  </span>
                ),
                sortValue: (product) => product.name,
              },
              {
                key: "status",
                label: T.columns.status,
                cell: (product) =>
                  soldOut.has(product.id) ? (
                    <span className="bo-badge" data-tone="danger">
                      {T.soldOut}
                    </span>
                  ) : (
                    <span className="bo-badge" data-tone="ok">
                      {T.available}
                    </span>
                  ),
                sortValue: (product) => (soldOut.has(product.id) ? 0 : 1),
              },
            ]}
            search={{ label: T.search, text: (product) => product.name }}
            filters={[
              { key: "available", label: T.filters.available, test: (product) => !soldOut.has(product.id) },
              { key: "soldOut", label: T.filters.soldOut, test: (product) => soldOut.has(product.id) },
            ]}
            actions={(product) => (
              <div>
                <label className="bo-toggle">
                  <input
                    type="checkbox"
                    className="bo-toggle__input"
                    checked={!soldOut.has(product.id)}
                    disabled={pending === product.id}
                    aria-label={T.toggleLabel(product.name)}
                    onChange={(event) => void toggle(product.id, event.target.checked)}
                  />
                  <span className="bo-toggle__track" aria-hidden="true" />
                </label>
              </div>
            )}
            empty={<EmptyState icon={CircleOff}>{T.empty}</EmptyState>}
          />
        )}
      </LoadStateView>
    </section>
  );
}
