"use client";

import { type FormEvent, useState } from "react";
import type { DiningTable } from "../../lib/api/floor-api";
import { TABLE_NAME_MAX, editedTableBody, floorName, seatCount } from "../../lib/floor/floor-drafts";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { ConfirmPanel } from "../ui/confirm-panel";
import { ErrorNotice, SuccessNotice } from "../ui/error-notice";
import { TextField } from "../ui/text-field";
import { useFloorWrite } from "./use-floor-write";

const T = vi.floor;

/** One table of an area: its name and seats edited in place, and removing it with a confirm. */
export function TableRowEditor({ table, onChanged }: { table: DiningTable; onChanged: () => void }) {
  const api = useApi();
  const write = useFloorWrite(onChanged);
  const [name, setName] = useState(table.name);
  const [seats, setSeats] = useState(String(table.seats));
  const [confirming, setConfirming] = useState(false);

  if (table.archivedAt !== null) {
    return (
      <li className="bo-table-row bo-muted bo-wrap" data-table-id={table.id}>
        {table.name} · {T.archived}
      </li>
    );
  }

  function save(event: FormEvent) {
    event.preventDefault();
    const checkedName = floorName(name, TABLE_NAME_MAX);
    const checkedSeats = seatCount(seats);
    if (checkedName === null || checkedSeats === null) return;
    void write.run(() => api.putTable(table.id, editedTableBody(table, checkedName, checkedSeats)), () => vi.common.saved);
  }

  async function remove() {
    const removed = await write.run(
      () => api.removeTable(table.id),
      (outcome) => (outcome === "deleted" ? T.removed(table.name) : T.archivedDone(table.name)),
    );
    if (removed) setConfirming(false);
  }

  return (
    <li className="bo-table-row" data-table-id={table.id}>
      <form className="bo-field-row" onSubmit={save} noValidate>
        <TextField
          label={T.tableName}
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
        <button type="submit" className="bo-button" disabled={write.busy} aria-label={T.saveTable(table.name)}>
          {vi.common.save}
        </button>
        <button
          type="button"
          className="bo-button bo-button--danger"
          disabled={write.busy}
          aria-label={T.removeTable(table.name)}
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
          title={T.removeTableTitle(table.name)}
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
    </li>
  );
}
