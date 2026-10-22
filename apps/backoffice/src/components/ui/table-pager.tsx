"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { vi } from "../../messages/vi";
import { Icon } from "./icon";
import { Listbox } from "./listbox";

const T = vi.table;

/** How many rows a page of a list shows, the first being where every list starts. */
export const PAGE_SIZES = [25, 50, 100] as const;

/** The pages a list of `count` rows takes at `size` a page: at least one. */
export const pageCount = (count: number, size: number) => Math.max(1, Math.ceil(count / size));

/** The rows of page `page` (from 1), the page held inside the list's pages. */
export function pageOf<R>(rows: readonly R[], page: number, size: number): { rows: readonly R[]; page: number } {
  const held = Math.min(Math.max(page, 1), pageCount(rows.length, size));
  return { rows: rows.slice((held - 1) * size, held * size), page: held };
}

/**
 * The foot of a long list: which rows are on screen of how many, how many a page shows, and
 * the way to the page before and after. A list shorter than the smallest page has none.
 */
export function TablePager({
  page,
  size,
  total,
  onPage,
  onSize,
}: {
  page: number;
  size: number;
  total: number;
  onPage: (page: number) => void;
  onSize: (size: number) => void;
}) {
  if (total <= PAGE_SIZES[0]) return null;
  const pages = pageCount(total, size);
  const from = (page - 1) * size + 1;
  const to = Math.min(page * size, total);
  return (
    <nav className="bo-pager" aria-label={T.pager}>
      <p className="bo-pager__range bo-num" aria-live="polite">
        {T.range(from, to, total)}
      </p>
      <Listbox
        className="bo-pager__size bo-listbox--up"
        label={T.pageSize}
        hideLabel
        value={String(size)}
        choices={PAGE_SIZES.map((choice) => ({ value: String(choice), label: T.pageSizeOption(choice) }))}
        onChange={(value) => onSize(Number(value))}
      />
      <div className="bo-pager__steps">
        <button
          type="button"
          className="bo-icon-button"
          aria-label={T.previousPage}
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <Icon of={ChevronLeft} size={18} />
        </button>
        <span className="bo-pager__page bo-num">{T.pageOf(page, pages)}</span>
        <button
          type="button"
          className="bo-icon-button"
          aria-label={T.nextPage}
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          <Icon of={ChevronRight} size={18} />
        </button>
      </div>
    </nav>
  );
}
