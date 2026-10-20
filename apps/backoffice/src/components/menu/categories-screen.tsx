"use client";

import { ArrowDown, ArrowUp, Pencil, Tags, Trash2 } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import type { ApiFailure } from "../../lib/api/api-result";
import type { Category } from "../../lib/api/catalog-api";
import { failureMessage, isSignedOut } from "../../lib/errors/failure-message";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { LoadStateView } from "../shell/load-state-view";
import { PageHeader } from "../shell/page-header";
import { useSession } from "../shell/session-context";
import { useApiLoad } from "../shell/use-api-load";
import { EmptyState } from "../ui/empty-state";
import { ErrorNotice, SuccessNotice } from "../ui/error-notice";
import { Icon } from "../ui/icon";
import { TextField } from "../ui/text-field";
import { SORT_STEP, inMenuOrder, moveCategory } from "../../lib/catalog/category-order";
import { newId } from "./product-editor/product-draft";

const T = vi.menu.categories;
const NAME_MAX = 120;

function nameProblem(name: string): string | undefined {
  if (name.trim() === "") return vi.common.nameMissing;
  if (name.trim().length > NAME_MAX) return vi.common.nameTooLong(NAME_MAX);
  return undefined;
}

export function CategoriesScreen() {
  const api = useApi();
  const { branch, signedOut } = useSession();
  const brandId = branch?.brandId ?? null;
  const load = useMemo(() => (brandId === null ? null : () => api.listCategories(brandId)), [api, brandId]);
  const [loaded, reload, refresh] = useApiLoad(load);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [moving, setMoving] = useState(false);

  const report = (result: ApiFailure) => {
    if (isSignedOut(result)) signedOut();
    setFailure(failureMessage(result));
  };

  async function add(event: FormEvent, categories: readonly Category[]) {
    event.preventDefault();
    setDone(null);
    setFailure(null);
    const problem = nameProblem(name);
    setNameError(problem);
    if (problem !== undefined || brandId === null) return;
    const last = Math.max(0, ...categories.map((category) => category.sortOrder));
    const result = await api.putCategory(newId(), { version: null, brandId, name: name.trim(), sortOrder: last + SORT_STEP });
    if (!result.ok) return report(result);
    setName("");
    setDone(T.added(result.value.name));
    refresh();
  }

  async function rename(category: Category, newName: string) {
    setFailure(null);
    if (nameProblem(newName) !== undefined) return setFailure(nameProblem(newName) ?? null);
    const body = { version: category.version, brandId: category.brandId, name: newName.trim(), sortOrder: category.sortOrder };
    const result = await api.putCategory(category.id, body);
    if (!result.ok) return report(result);
    setRenaming(null);
    refresh();
  }

  async function move(categories: readonly Category[], index: number, direction: -1 | 1) {
    setDone(null);
    setFailure(null);
    setMoving(true);
    for (const { category, sortOrder } of moveCategory(categories, index, direction)) {
      const body = { version: category.version, brandId: category.brandId, name: category.name, sortOrder };
      const result = await api.putCategory(category.id, body);
      if (!result.ok) {
        report(result);
        break;
      }
    }
    setMoving(false);
    refresh();
  }

  async function remove(category: Category) {
    setDone(null);
    setFailure(null);
    const result = await api.deleteCategory(category.id);
    if (!result.ok) return report(result);
    setDone(T.deleted(category.name));
    refresh();
  }

  return (
    <section className="bo-stack" aria-labelledby="categories-title">
      <PageHeader
        section="/menu/categories"
        title={T.title}
        titleId="categories-title"
        hint={brandId === null ? vi.menu.chooseBranch : T.hint}
      />
      <ErrorNotice message={failure} />
      <SuccessNotice message={done} />
      <LoadStateView loaded={loaded} retry={reload}>
        {(categories) => (
          <>
            <form className="bo-card bo-row" onSubmit={(event) => void add(event, categories)} noValidate>
              <TextField label={T.newLabel} value={name} onChange={setName} error={nameError} />
              <button type="submit" className="bo-button bo-button--primary">
                {T.add}
              </button>
            </form>
            {categories.length === 0 && (
              <div className="bo-empty">
                <EmptyState icon={Tags}>{T.empty}</EmptyState>
              </div>
            )}
            <ul className="bo-choice-list" aria-label={T.title}>
              {inMenuOrder(categories).map((category, index, ordered) => (
                <li key={category.id} className="bo-card bo-row bo-category-row">
                  {renaming?.id === category.id ? (
                    <>
                      <TextField label={T.nameLabel} value={renaming.name} onChange={(value) => setRenaming({ id: category.id, name: value })} />
                      <button type="button" className="bo-button bo-button--primary" onClick={() => void rename(category, renaming.name)}>
                        {vi.common.save}
                      </button>
                      <button type="button" className="bo-button" onClick={() => setRenaming(null)}>
                        {vi.common.cancel}
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="bo-category-row__order" aria-hidden="true">
                        {index + 1}
                      </span>
                      <span className="bo-wrap bo-grow bo-category-row__name">{category.name}</span>
                      <button
                        type="button"
                        className="bo-icon-button"
                        aria-label={T.moveUp(category.name)}
                        disabled={moving || index === 0}
                        onClick={() => void move(categories, index, -1)}
                      >
                        <Icon of={ArrowUp} size={16} />
                      </button>
                      <button
                        type="button"
                        className="bo-icon-button"
                        aria-label={T.moveDown(category.name)}
                        disabled={moving || index === ordered.length - 1}
                        onClick={() => void move(categories, index, 1)}
                      >
                        <Icon of={ArrowDown} size={16} />
                      </button>
                      <button type="button" className="bo-button" aria-label={T.renameLabel(category.name)} onClick={() => setRenaming({ id: category.id, name: category.name })}>
                        <Icon of={Pencil} size={16} />
                        {T.rename}
                      </button>
                      <button type="button" className="bo-button bo-button--danger" aria-label={T.deleteLabel(category.name)} onClick={() => void remove(category)}>
                        <Icon of={Trash2} size={16} />
                        {vi.common.remove}
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </LoadStateView>
    </section>
  );
}
