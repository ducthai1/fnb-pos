"use client";

import { type FormEvent, useId, useState } from "react";
import { v7 as uuidv7 } from "uuid";
import type { Area, DiningTable } from "../../lib/api/floor-api";
import { AREA_NAME_MAX, TABLE_NAME_MAX, floorName, newTableBody, renamedAreaBody, seatCount } from "../../lib/floor/floor-drafts";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { ConfirmPanel } from "../ui/confirm-panel";
import { ErrorNotice, SuccessNotice } from "../ui/error-notice";
import { TextField } from "../ui/text-field";
import { AreaPlan } from "./area-plan";
import { TableRowEditor } from "./table-row-editor";
import { useFloorWrite } from "./use-floor-write";

const T = vi.floor;

function NewTableForm({ area, tables, onChanged }: { area: Area; tables: readonly DiningTable[]; onChanged: () => void }) {
  const api = useApi();
  const write = useFloorWrite(onChanged);
  const [name, setName] = useState("");
  const [seats, setSeats] = useState("4");

  async function add(event: FormEvent) {
    event.preventDefault();
    const checkedName = floorName(name, TABLE_NAME_MAX);
    const checkedSeats = seatCount(seats);
    if (checkedName === null || checkedSeats === null) return;
    const body = newTableBody(area.id, checkedName, checkedSeats, tables);
    if (await write.run(() => api.putTable(uuidv7(), body), () => vi.common.saved)) setName("");
  }

  return (
    <form className="bo-field-row" onSubmit={(event) => void add(event)} noValidate>
      <TextField
        label={T.newTableName}
        value={name}
        disabled={write.busy}
        error={floorName(name, TABLE_NAME_MAX) === null ? T.nameInvalid(TABLE_NAME_MAX) : undefined}
        onChange={setName}
      />
      <TextField
        label={T.seats}
        value={seats}
        inputMode="numeric"
        className="bo-field--narrow"
        disabled={write.busy}
        error={seatCount(seats) === null ? T.seatsInvalid : undefined}
        onChange={setSeats}
      />
      {/* The area's name is the shop's and may not wrap: it is in the accessible name only. */}
      <button type="submit" className="bo-button" disabled={write.busy} aria-label={T.addTable(area.name)}>
        {T.addTableShort}
      </button>
      <ErrorNotice message={write.error} />
    </form>
  );
}

/** An area: renamed in place, removed with a confirm, its tables listed and added to. */
export function AreaCard({ area, tables, onChanged }: { area: Area; tables: readonly DiningTable[]; onChanged: () => void }) {
  const api = useApi();
  const titleId = useId();
  const write = useFloorWrite(onChanged);
  const [name, setName] = useState(area.name);
  const [confirming, setConfirming] = useState(false);

  function rename(event: FormEvent) {
    event.preventDefault();
    const checked = floorName(name, AREA_NAME_MAX);
    if (checked !== null) void write.run(() => api.putArea(area.id, renamedAreaBody(area, checked)), () => vi.common.saved);
  }

  async function remove() {
    const removed = await write.run(
      () => api.removeArea(area.id, area.version),
      (outcome) => (outcome === "deleted" ? T.removed(area.name) : T.archivedDone(area.name)),
    );
    if (removed) setConfirming(false);
  }

  return (
    <section className="bo-card" aria-labelledby={titleId} data-area-id={area.id}>
      <h2 id={titleId} className="bo-subtitle bo-wrap">
        {T.area(area.name)}
      </h2>
      <form className="bo-field-row" onSubmit={rename} noValidate>
        <TextField
          label={T.areaName}
          value={name}
          disabled={write.busy}
          error={floorName(name, AREA_NAME_MAX) === null ? T.nameInvalid(AREA_NAME_MAX) : undefined}
          onChange={setName}
        />
        <button type="submit" className="bo-button" disabled={write.busy} aria-label={T.saveArea(area.name)}>
          {vi.common.save}
        </button>
        <button
          type="button"
          className="bo-button bo-button--danger"
          disabled={write.busy}
          aria-label={T.removeArea(area.name)}
          onClick={() => {
            write.dismiss();
            setConfirming(true);
          }}
        >
          {vi.common.remove}
        </button>
      </form>
      {confirming ? (
        <ConfirmPanel
          title={T.removeAreaTitle(area.name)}
          hint={T.removeHint}
          confirmLabel={T.removeConfirm}
          busyLabel={T.removing}
          busy={write.busy}
          error={write.error}
          onConfirm={() => void remove()}
          onCancel={() => {
            setConfirming(false);
            write.dismiss();
          }}
        />
      ) : (
        <ErrorNotice message={write.error} />
      )}
      <SuccessNotice message={write.done} />
      {tables.some((table) => table.archivedAt === null) && (
        <AreaPlan areaName={area.name} tables={tables.filter((table) => table.archivedAt === null)} onChanged={onChanged} />
      )}
      {tables.length === 0 ? (
        <p className="bo-muted">{T.noTables}</p>
      ) : (
        <ul className="bo-table-rows">
          {tables.map((table) => (
            <TableRowEditor key={table.id} table={table} onChanged={onChanged} />
          ))}
        </ul>
      )}
      <NewTableForm area={area} tables={tables} onChanged={onChanged} />
    </section>
  );
}
