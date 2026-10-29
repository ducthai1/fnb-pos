"use client";

import { FolderInput, X } from "lucide-react";
import { useState } from "react";
import type { CatalogApi, Category } from "../../lib/api/catalog-api";
import { bodyOfDocument } from "../../lib/catalog/product-document";
import { failureMessage } from "../../lib/errors/failure-message";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { Listbox } from "../ui/listbox";
import { Icon } from "../ui/icon";

const T = vi.menu.products;
const NONE = "__none";

/**
 * Moves each product to the category, one at a time: read whole just before it is saved,
 * so its version is current and only its category changes. Counts those refused.
 */
async function moveAll(
  api: CatalogApi,
  ids: readonly string[],
  categoryId: string | null,
  onDone: (done: number) => void,
): Promise<{ failed: number; why: string | null }> {
  let failed = 0;
  let why: string | null = null;
  for (const [at, id] of ids.entries()) {
    const current = await api.getProduct(id);
    const saved = current.ok
      ? await api.putProduct(id, { ...bodyOfDocument(current.value), categoryId })
      : current;
    if (!saved.ok) {
      failed += 1;
      why ??= failureMessage(saved);
    }
    onDone(at + 1);
  }
  return { failed, why };
}

/** The bar over the product list once products are ticked: where to move them, and go. */
export function ProductBulkMove({
  picked,
  categories,
  onClear,
  onMoved,
}: {
  picked: readonly string[];
  categories: readonly Category[];
  onClear: () => void;
  onMoved: (message: string, failed: boolean) => void;
}) {
  const api = useApi();
  const [target, setTarget] = useState(NONE);
  const [done, setDone] = useState<number | null>(null);
  const choices = [
    { value: NONE, label: vi.menu.editor.noCategory },
    ...[...categories]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((c) => ({ value: c.id, label: c.name })),
  ];
  const targetName = choices.find((choice) => choice.value === target)?.label ?? "";

  const move = async () => {
    setDone(0);
    const result = await moveAll(api, picked, target === NONE ? null : target, setDone);
    setDone(null);
    const moved = picked.length - result.failed;
    onMoved(
      result.why === null ? T.moved(moved, targetName) : T.moveFailed(result.failed, result.why),
      result.why !== null,
    );
  };

  return (
    <div className="bo-card bo-bulk" role="region" aria-label={T.picked(picked.length)}>
      <strong className="bo-bulk__count">{T.picked(picked.length)}</strong>
      <Listbox
        label={T.moveTo}
        value={target}
        choices={choices}
        onChange={setTarget}
        disabled={done !== null}
      />
      <div className="bo-bulk__actions">
        <button
          type="button"
          className="bo-button bo-button--primary"
          disabled={done !== null}
          onClick={() => void move()}
        >
          <Icon of={FolderInput} />
          {done === null ? T.move : T.moving(done, picked.length)}
        </button>
        <button type="button" className="bo-button" disabled={done !== null} onClick={onClear}>
          <Icon of={X} />
          {T.clearPicked}
        </button>
      </div>
    </div>
  );
}
