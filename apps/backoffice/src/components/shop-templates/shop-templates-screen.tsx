"use client";

import { Check, LayoutTemplate } from "lucide-react";
import { useMemo, useState } from "react";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { LoadStateView } from "../shell/load-state-view";
import { PageHeader } from "../shell/page-header";
import { useSession } from "../shell/session-context";
import { useApiLoad } from "../shell/use-api-load";
import { Icon } from "../ui/icon";
import { TemplatePlanPreview } from "./template-plan-preview";

const T = vi.shopTemplates;

/** Pick a kind of shop, see what it would add to the branch being looked at, and apply it. */
export function ShopTemplatesScreen() {
  const api = useApi();
  const { branch } = useSession();
  const load = useMemo(() => () => api.listShopTemplates(), [api]);
  const [templates, reload] = useApiLoad(load);
  const [pickedId, setPickedId] = useState<string | null>(null);

  return (
    <section className="bo-stack" aria-labelledby="shop-templates-title">
      <PageHeader section="/settings/templates" title={T.title} titleId="shop-templates-title" hint={branch === null ? T.chooseBranch : T.hint} />
      <LoadStateView loaded={templates} retry={reload}>
        {(list) => {
          const picked = list.find((template) => template.id === pickedId) ?? null;
          return (
            <>
              <div className="bo-card bo-stack">
                <h2 className="bo-subtitle" id="template-pick-title">
                  {T.pickTitle}
                </h2>
                <div className="bo-template-grid" role="radiogroup" aria-labelledby="template-pick-title">
                  {list.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      role="radio"
                      aria-checked={template.id === pickedId}
                      className="bo-template-card"
                      onClick={() => setPickedId(template.id)}
                    >
                      <span className="bo-template-card__icon" aria-hidden="true">
                        <Icon of={template.id === pickedId ? Check : LayoutTemplate} size={20} />
                      </span>
                      <span className="bo-template-card__name bo-wrap">{template.name}</span>
                      <span className="bo-muted bo-wrap">{template.description}</span>
                      <span className="bo-template-card__counts">{T.includes(template.categories.length, template.stations.length)}</span>
                    </button>
                  ))}
                </div>
              </div>
              {picked !== null && branch !== null && <TemplatePlanPreview key={`${picked.id}:${branch.id}`} template={picked} branch={branch} />}
            </>
          );
        }}
      </LoadStateView>
    </section>
  );
}
