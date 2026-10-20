"use client";

import { Square, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import type { Category, ProductSummary } from "../../../lib/api/catalog-api";
import type { ProductBody } from "../../../lib/catalog/product-document";
import { vi } from "../../../messages/vi";
import { useApi } from "../../app/api-context";
import { ErrorNotice, SuccessNotice } from "../../ui/error-notice";
import { Icon } from "../../ui/icon";
import { SelectField } from "../../ui/select-field";
import type { ReadSheet } from "./import-file-card";
import { ImportPreviewTable } from "./import-preview-table";
import { type CategoryTarget, planMenuImport, rowsToWrite } from "./plan-menu-import";
import { useImportRun } from "./use-import-run";

const T = vi.menuImport;
const BY_GROUP = "__group";
const NONE = "__none";
const KINDS = ["prepared_drink", "prepared_item", "retail_item", "service"] as const;

const targetOf = (value: string): CategoryTarget =>
  value === BY_GROUP ? { by: "group" } : { by: "one", id: value === NONE ? null : value };

/** The lines of a read sheet against the menu as it is: the choices, the table, the run. */
export function ImportPreview({
  sheet,
  brandId,
  products,
  categories,
  onWritten,
}: {
  sheet: ReadSheet;
  brandId: string;
  products: readonly ProductSummary[];
  categories: readonly Category[];
  onWritten: () => void;
}) {
  const api = useApi();
  const [target, setTarget] = useState(BY_GROUP);
  const [kind, setKind] = useState<ProductBody["kind"]>("prepared_drink");
  const rows = useMemo(
    () =>
      planMenuImport({
        rows: sheet.rows,
        products,
        categories,
        brandId,
        kind,
        target: targetOf(target),
      }),
    [sheet, products, categories, brandId, kind, target],
  );
  const run = useImportRun(api, onWritten);
  const toWrite = rowsToWrite(rows).filter((row) => run.outcomes.get(row.line)?.ok !== true);
  const progress = run.state.state === "running" ? run.state : null;
  const running = progress !== null;

  const categoryChoices = [
    { value: BY_GROUP, label: T.categoryByGroup },
    { value: NONE, label: T.categoryNone },
    ...[...categories]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((c) => ({ value: c.id, label: c.name })),
  ];
  const kindChoices = KINDS.map((value) => ({ value, label: vi.menu.editor.kinds[value] }));

  return (
    <>
      {sheet.ignored.length > 0 && (
        <div className="bo-notice bo-notice--warn bo-wrap" role="note" aria-label={T.ignoredTitle}>
          <strong>{T.ignoredTitle}: </strong>
          {T.ignored(sheet.ignored.join(", "))}
        </div>
      )}
      <div className="bo-card bo-import-options">
        <SelectField
          label={T.categoryLabel}
          value={target}
          choices={categoryChoices}
          onChange={setTarget}
          disabled={running}
        />
        <SelectField
          label={T.kindLabel}
          value={kind}
          choices={kindChoices}
          onChange={(value) => setKind(value as ProductBody["kind"])}
          disabled={running}
        />
        <p className="bo-muted bo-wrap bo-import-options__hint">{T.matchHint}</p>
      </div>
      <div className="bo-card bo-import-run">
        {progress !== null ? (
          <>
            <div className="bo-import-run__progress">
              <progress
                max={progress.total}
                value={progress.done}
                aria-label={T.progress(progress.done, progress.total)}
              />
              <span role="status">{T.progress(progress.done, progress.total)}</span>
            </div>
            <button type="button" className="bo-button" onClick={run.stop}>
              <Icon of={Square} />
              {T.stop}
            </button>
          </>
        ) : (
          <>
            <p className="bo-wrap bo-muted">
              {toWrite.length === 0
                ? T.nothingToImport
                : T.willWrite(
                    toWrite.filter((row) => row.status === "new").length,
                    toWrite.filter((row) => row.status === "update").length,
                  )}
            </p>
            {toWrite.length > 0 && (
              <button
                type="button"
                className="bo-button bo-button--primary"
                onClick={() => run.start({ brandId, rows: toWrite, categories })}
              >
                <Icon of={Upload} />
                {T.start(toWrite.length)}
              </button>
            )}
          </>
        )}
      </div>
      {run.state.state === "finished" &&
        (run.state.failed === 0 && !run.state.stopped ? (
          <SuccessNotice message={T.finished(run.state.imported, 0)} />
        ) : (
          <ErrorNotice
            message={
              run.state.stopped
                ? T.stopped(run.state.imported)
                : T.finished(run.state.imported, run.state.failed)
            }
          />
        ))}
      <ImportPreviewTable
        rows={rows}
        outcomes={run.outcomes}
        products={products}
        categories={categories}
      />
    </>
  );
}
