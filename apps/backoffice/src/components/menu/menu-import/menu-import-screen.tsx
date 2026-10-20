"use client";

import { ArrowLeft, FileDown } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { bothResults } from "../../../lib/api/both-results";
import { vi } from "../../../messages/vi";
import { useApi } from "../../app/api-context";
import { LoadStateView } from "../../shell/load-state-view";
import { PageHeader } from "../../shell/page-header";
import { useSession } from "../../shell/session-context";
import { useApiLoad } from "../../shell/use-api-load";
import { Icon } from "../../ui/icon";
import { downloadMenuTemplate } from "./download-menu-sheet";
import { ImportFileCard, type ReadSheet } from "./import-file-card";
import { ImportPreview } from "./import-preview";

const T = vi.menuImport;

/**
 * Bringing a menu over from another POS: a products sheet is read in the browser, every
 * line is judged against the menu of the branch's brand, and only then written, one
 * product at a time, through the same catalog routes as the product editor.
 */
export function MenuImportScreen() {
  const api = useApi();
  const { branch } = useSession();
  const brandId = branch?.brandId ?? null;
  const load = useMemo(
    () =>
      brandId === null
        ? null
        : () => bothResults(api.listProducts(brandId), api.listCategories(brandId)),
    [api, brandId],
  );
  const [loaded, reload, refresh] = useApiLoad(load);
  const [sheet, setSheet] = useState<{ read: ReadSheet; key: number } | null>(null);

  return (
    <section className="bo-stack" aria-labelledby="menu-import-title">
      <PageHeader
        section="/menu"
        trail={[{ label: T.title }]}
        title={T.title}
        titleId="menu-import-title"
        hint={T.hint}
        actions={
          <>
            <button type="button" className="bo-button" onClick={downloadMenuTemplate}>
              <Icon of={FileDown} />
              {T.template}
            </button>
            <Link className="bo-button" href="/menu">
              <Icon of={ArrowLeft} />
              {T.back}
            </Link>
          </>
        }
      />
      {branch === null || brandId === null ? (
        <p className="bo-muted">{vi.menu.chooseBranch}</p>
      ) : (
        <>
          <ImportFileCard
            read={sheet?.read ?? null}
            onRead={(read) =>
              setSheet((current) => (read === null ? null : { read, key: (current?.key ?? 0) + 1 }))
            }
          />
          {sheet !== null && (
            <LoadStateView loaded={loaded} retry={reload}>
              {([products, categories]) => (
                <ImportPreview
                  key={sheet.key}
                  sheet={sheet.read}
                  brandId={brandId}
                  products={products}
                  categories={categories}
                  onWritten={refresh}
                />
              )}
            </LoadStateView>
          )}
        </>
      )}
    </section>
  );
}
