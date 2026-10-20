"use client";

import { useMemo, useState } from "react";
import type { ApiResult } from "../../lib/api/api-result";
import type { ProductSummary } from "../../lib/api/catalog-api";
import { failureMessage, isSignedOut } from "../../lib/errors/failure-message";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { LoadStateView } from "../shell/load-state-view";
import { PageHeader } from "../shell/page-header";
import { useSession } from "../shell/session-context";
import { useApiLoad } from "../shell/use-api-load";
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
        {({ products, soldOut }) =>
          products.length === 0 ? (
            <p className="bo-muted">{T.empty}</p>
          ) : (
            <ul className="bo-choice-list" aria-label={T.title}>
              {products.map((product) => {
                const available = !soldOut.has(product.id);
                return (
                  <li key={product.id} className="bo-card bo-row">
                    <label className="bo-field--inline bo-wrap bo-grow">
                      <input
                        type="checkbox"
                        checked={available}
                        disabled={pending === product.id}
                        aria-label={T.toggleLabel(product.name)}
                        onChange={(event) => void toggle(product.id, event.target.checked)}
                      />
                      {product.name}
                    </label>
                    <span className={available ? "bo-muted" : "bo-notice bo-notice--warn"}>
                      {available ? T.available : T.soldOut}
                    </span>
                  </li>
                );
              })}
            </ul>
          )
        }
      </LoadStateView>
    </section>
  );
}
