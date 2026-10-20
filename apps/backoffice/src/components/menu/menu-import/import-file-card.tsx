"use client";

import { FileSpreadsheet } from "lucide-react";
import { useId, useState } from "react";
import { type MenuSheetRow, readMenuSheet } from "../../../lib/catalog/menu-sheet/read-menu-sheet";
import { readXlsxSheet } from "../../../lib/sheet/read-xlsx-sheet";
import { vi } from "../../../messages/vi";
import { ErrorNotice } from "../../ui/error-notice";
import { Icon } from "../../ui/icon";

const T = vi.menuImport;
/** An .xlsx of a few thousand products is well under this; the reading happens in the tab. */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export interface ReadSheet {
  readonly fileName: string;
  readonly rows: readonly MenuSheetRow[];
  readonly ignored: readonly string[];
}

async function readFile(file: File): Promise<ReadSheet | string> {
  if (file.size > MAX_FILE_BYTES) return T.tooBig;
  const sheet = readXlsxSheet(new Uint8Array(await file.arrayBuffer()));
  if (!sheet.ok) return sheet.reason === "too_big" ? T.tooBig : T.unreadable;
  const menu = readMenuSheet(sheet.rows);
  if (!menu.ok) return menu.reason === "no_name_column" ? T.noNameColumn : T.noRows;
  return { fileName: file.name, rows: menu.rows, ignored: menu.ignored };
}

/** Where the person picks the sheet; it is read here, in the browser, and nothing is sent. */
export function ImportFileCard({
  read,
  onRead,
}: {
  read: ReadSheet | null;
  onRead: (sheet: ReadSheet | null) => void;
}) {
  const id = useId();
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    if (file === undefined) return;
    setReading(true);
    setError(null);
    onRead(null);
    const result = await readFile(file).catch(() => T.unreadable);
    setReading(false);
    if (typeof result === "string") setError(result);
    else onRead(result);
  };

  return (
    <div className="bo-card bo-import-file">
      <span className="bo-import-file__icon" aria-hidden="true">
        <Icon of={FileSpreadsheet} size={24} />
      </span>
      <div className="bo-import-file__body">
        <label htmlFor={id} className="bo-import-file__label">
          {T.fileLabel}
        </label>
        <input
          id={id}
          type="file"
          className="bo-import-file__input"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-describedby={`${id}-hint`}
          onChange={(event) => void pick(event.target.files?.[0])}
        />
        <p id={`${id}-hint`} className="bo-muted bo-wrap">
          {T.fileHint}
        </p>
        {reading && <p className="bo-loading">{T.reading}</p>}
        {read !== null && (
          <p className="bo-wrap" role="status">
            {T.fileRead(read.fileName, read.rows.length)}
          </p>
        )}
        <ErrorNotice message={error} />
      </div>
    </div>
  );
}
