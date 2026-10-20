import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi as mock } from "vitest";
import { vi } from "../../messages/vi";
import { refused } from "../../test-support/fake-backoffice-api";
import { TABLE_1, TERRACE, fakeFloor } from "../../test-support/fake-floor";
import { planBox } from "../../lib/floor/plan-geometry";
import { renderSignedIn } from "../../test-support/render-signed-in";
import { FloorScreen } from "./floor-screen";

const T = vi.floor;
const VIEW = planBox([TABLE_1]);
const tableOnPlan = () => screen.getByRole("button", { name: T.moveTable(TABLE_1.name, TABLE_1.seats) });

async function openPlan(more = {}) {
  const floor = fakeFloor();
  await renderSignedIn(<FloorScreen />, { ...floor.api, ...more });
  await screen.findByRole("group", { name: T.planTitle(TERRACE.name) });
  return floor;
}

const placeOf = (body: unknown) => {
  const { x, y } = body as { x: number; y: number };
  return { x, y };
};

describe("moving tables on the plan of an area", () => {
  it("draws a table where it stands, as a share of the plan shown", async () => {
    await openPlan();
    // The plan shows the table's far edges plus room to drag into: 3800 × 2400 units.
    expect(VIEW).toEqual({ width: 3_800, height: 2_400 });
    expect(tableOnPlan().style.left).toBe(`${(2_400 / 3_800) * 100}%`);
    expect(tableOnPlan().style.top).toBe("50%");
    expect(tableOnPlan().dataset.shape).toBe("circle");
  });

  it("moves a table by an arrow key and saves only its place, on the version it read", async () => {
    const floor = await openPlan();
    fireEvent.keyDown(tableOnPlan(), { key: "ArrowRight" });
    await screen.findByText(T.moved(TABLE_1.name));
    const [id, body] = floor.putTable.mock.calls[0]!;
    expect(id).toBe(TABLE_1.id);
    expect(body).toEqual({ ...tableOneBody(), x: 2_500 });
    fireEvent.keyDown(tableOnPlan(), { key: "ArrowDown", shiftKey: true });
    await mock.waitFor(() => expect(floor.putTable).toHaveBeenCalledTimes(2));
    expect(placeOf(floor.putTable.mock.calls[1]![1])).toEqual({ x: 2_500, y: 1_700 });
    fireEvent.keyDown(tableOnPlan(), { key: "a" });
    expect(floor.putTable).toHaveBeenCalledTimes(2);
  });

  it("drags a table by the pointer, in plan units for the pixels moved, snapped, and saves on drop", async () => {
    const floor = await openPlan();
    const plan = tableOnPlan().parentElement!;
    Object.defineProperty(plan, "clientWidth", { value: VIEW.width / 10 });
    fireEvent.pointerDown(tableOnPlan(), { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(tableOnPlan(), { clientX: 152, clientY: 81, pointerId: 1 });
    expect(floor.putTable).not.toHaveBeenCalled();
    fireEvent.pointerUp(tableOnPlan(), { clientX: 152, clientY: 81, pointerId: 1 });
    await screen.findByText(T.moved(TABLE_1.name));
    // 10 units a pixel: 52 px right → 520 → 500 on the grid; 19 px up → 190 → 200.
    expect(placeOf(floor.putTable.mock.calls[0]![1])).toEqual({ x: 2_900, y: 1_000 });
  });

  it("saves nothing for a tap that does not move the table", async () => {
    const floor = await openPlan();
    Object.defineProperty(tableOnPlan().parentElement!, "clientWidth", { value: VIEW.width / 10 });
    fireEvent.pointerDown(tableOnPlan(), { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(tableOnPlan(), { clientX: 100, clientY: 100, pointerId: 1 });
    expect(floor.putTable).not.toHaveBeenCalled();
  });

  it("puts a table back and says why when the move is refused", async () => {
    const putTable = mock.fn(async () => refused(409, "API_VERSION_CONFLICT"));
    await openPlan({ putTable });
    fireEvent.keyDown(tableOnPlan(), { key: "ArrowLeft" });
    const group = screen.getByRole("group", { name: T.planTitle(TERRACE.name) });
    await within(group).findByRole("alert");
    expect(tableOnPlan().style.left).toBe(`${(2_400 / 3_800) * 100}%`);
  });
});

/** TABLE_1 as a PUT body: every field but its id and archive mark. */
function tableOneBody() {
  const { areaId, name, x, y, width, height, shape, seats, sortOrder, version } = TABLE_1;
  return { version, areaId, name, x, y, width, height, shape, seats, sortOrder };
}
