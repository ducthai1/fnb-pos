"use client";

import { type FormEvent, useMemo, useState } from "react";
import { v7 as uuidv7 } from "uuid";
import type { ApiResult } from "../../lib/api/api-result";
import type { Area, DiningTable } from "../../lib/api/floor-api";
import { AREA_NAME_MAX, floorName, newAreaBody } from "../../lib/floor/floor-drafts";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { LoadStateView } from "../shell/load-state-view";
import { PageHeader } from "../shell/page-header";
import { useSession } from "../shell/session-context";
import { useApiLoad } from "../shell/use-api-load";
import { ErrorNotice } from "../ui/error-notice";
import { FieldRow, TextField } from "../ui/text-field";
import { AreaCard } from "./area-card";
import { useFloorWrite } from "./use-floor-write";

const T = vi.floor;

interface FloorPlan {
  readonly areas: readonly Area[];
  readonly tables: readonly DiningTable[];
}

function NewAreaForm({ branchId, areas, onChanged }: { branchId: string; areas: readonly Area[]; onChanged: () => void }) {
  const api = useApi();
  const write = useFloorWrite(onChanged);
  const [name, setName] = useState("");

  async function add(event: FormEvent) {
    event.preventDefault();
    const checked = floorName(name, AREA_NAME_MAX);
    if (checked === null) return;
    if (await write.run(() => api.putArea(uuidv7(), newAreaBody(branchId, checked, areas)), () => vi.common.saved)) {
      setName("");
    }
  }

  return (
    <form className="bo-card" onSubmit={(event) => void add(event)} noValidate>
      <FieldRow>
        <TextField
          label={T.newAreaLabel}
          value={name}
          disabled={write.busy}
          error={floorName(name, AREA_NAME_MAX) === null ? T.nameInvalid(AREA_NAME_MAX) : undefined}
          onChange={setName}
        />
        <button type="submit" className="bo-button bo-button--primary" disabled={write.busy}>
          {T.addArea}
        </button>
      </FieldRow>
      <ErrorNotice message={write.error} />
    </form>
  );
}

function FloorPlanView({ branchId, plan, onChanged }: { branchId: string; plan: FloorPlan; onChanged: () => void }) {
  const active = plan.areas.filter((area) => area.archivedAt === null);
  const archived = plan.areas.filter((area) => area.archivedAt !== null);
  return (
    <div className="bo-stack">
      <NewAreaForm branchId={branchId} areas={plan.areas} onChanged={onChanged} />
      {active.length === 0 && <p className="bo-muted">{T.noAreas}</p>}
      {active.map((area) => (
        <AreaCard
          key={area.id}
          area={area}
          tables={plan.tables.filter((table) => table.areaId === area.id)}
          onChanged={onChanged}
        />
      ))}
      {archived.map((area) => (
        <p key={area.id} className="bo-muted bo-wrap" data-area-id={area.id}>
          {T.area(area.name)} · {T.archived}
        </p>
      ))}
    </div>
  );
}

/** The areas and tables of the branch, edited as lists (no drag and drop). */
export function FloorScreen() {
  const api = useApi();
  const { branch } = useSession();
  const branchId = branch?.id ?? null;
  const load = useMemo(
    () =>
      branchId === null
        ? null
        : async (): Promise<ApiResult<FloorPlan>> => {
            const [areas, tables] = await Promise.all([api.listAreas(branchId), api.listTables(branchId)]);
            if (!areas.ok) return areas;
            if (!tables.ok) return tables;
            return { ok: true, value: { areas: areas.value, tables: tables.value } };
          },
    [api, branchId],
  );
  const [loaded, reload, refresh] = useApiLoad(load);

  return (
    <section className="bo-stack" aria-labelledby="floor-title">
      <PageHeader section="/floor" title={T.title} titleId="floor-title" hint={T.hint} />
      {branchId === null ? (
        <p className="bo-muted">{vi.devices.chooseBranch}</p>
      ) : (
        <LoadStateView loaded={loaded} retry={reload}>
          {(plan) => <FloorPlanView key={branchId} branchId={branchId} plan={plan} onChanged={refresh} />}
        </LoadStateView>
      )}
    </section>
  );
}
