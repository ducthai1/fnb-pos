import { posProductSchema } from "@fnb/contracts";
import { formatVnd, vnd } from "@fnb/domain";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PosApp } from "../../app/pos-app";
import { vi as text } from "../../messages/vi";
import {
  CREDENTIAL,
  fakeDependencies,
  memoryCredentials,
} from "../../test-support/fake-pos-server";
import { LAN, cafeServer, signedInTill } from "../../test-support/signed-in-till";
import { COFFEE, MENU } from "../../test-support/till-fixtures";

const tile = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) });
const price = (amount: number) => formatVnd(vnd(amount));

describe("the menu on the till follows the server", () => {
  it("shows a price changed on the server once a sync pass pulled it", async () => {
    const server = cafeServer();
    await signedInTill(server);
    expect(tile(COFFEE.name).textContent).toContain(price(29_000));

    server.state.feed.push({
      entity: "catalog_product",
      entityId: MENU.coffee,
      snapshot: { ...COFFEE, version: 11, basePrice: 32_000 },
    });
    await waitFor(() => expect(tile(COFFEE.name).textContent).toContain(price(32_000)));
    // The parsed copy is the domain's product: the same shape the bootstrap gave.
    expect(posProductSchema.safeParse(server.state.feed[0]?.snapshot).success).toBe(true);
  });

  it("greys out a sold-out product so it cannot be tapped, and offers it again when it is back", async () => {
    const server = cafeServer();
    await signedInTill(server);
    const cake = tile("Bánh croissant");
    expect(cake).toHaveProperty("disabled", true);
    expect(cake.textContent).toContain(text.sale.soldOut);
    expect(tile(COFFEE.name)).toHaveProperty("disabled", false);

    server.state.feed.push(
      {
        entity: "catalog_availability",
        entityId: MENU.cake,
        snapshot: { productId: MENU.cake, version: 11, entries: [] },
      },
      {
        entity: "catalog_availability",
        entityId: MENU.coffee,
        snapshot: {
          productId: MENU.coffee,
          version: 12,
          entries: [
            { channelKey: null, unavailableUntil: new Date(Date.now() + 3_600_000).toISOString() },
          ],
        },
      },
    );
    await waitFor(() => expect(tile("Bánh croissant")).toHaveProperty("disabled", false));
    expect(tile(COFFEE.name)).toHaveProperty("disabled", true);
  });

  it("sells a product whose sold-out end has already passed on the till's clock", async () => {
    const server = cafeServer();
    server.state.feed.push({
      entity: "catalog_availability",
      entityId: MENU.coffee,
      snapshot: {
        productId: MENU.coffee,
        version: 11,
        entries: [
          { channelKey: null, unavailableUntil: new Date(Date.now() - 60_000).toISOString() },
        ],
      },
    });
    await signedInTill(server);
    await waitFor(() => expect(server.state.calls.pulls).toBeGreaterThan(1));
    expect(tile(COFFEE.name)).toHaveProperty("disabled", false);
  });

  it("takes a product off the screen once the feed removes it", async () => {
    const server = cafeServer();
    // A till pulls the feed from its start, so it holds the copy the product was created with.
    server.state.feed.push({
      entity: "catalog_product",
      entityId: MENU.coffee,
      snapshot: { ...COFFEE, version: 4 },
    });
    await signedInTill(server);
    await waitFor(() => expect(server.state.calls.pulls).toBeGreaterThan(1));
    expect(tile(COFFEE.name)).toBeTruthy();
    server.state.feed.push({ entity: "catalog_product", entityId: MENU.coffee, snapshot: null });
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Cà phê sữa/ })).toBeNull());
  });
});

describe("who may sign in", () => {
  it("lists active staff on the PIN screen and leaves out someone switched off", async () => {
    const server = cafeServer([
      LAN,
      { id: MENU.brand, displayName: "Minh nghỉ việc", active: false },
    ]);
    render(
      <PosApp
        deps={fakeDependencies(server, { credentials: memoryCredentials(CREDENTIAL).store })}
      />,
    );
    expect(await screen.findByRole("button", { name: LAN.displayName })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Minh nghỉ việc" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: LAN.displayName }));
  });
});
