import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { cafeServer, signedInTill } from "../../test-support/signed-in-till";
import { COFFEE, MENU } from "../../test-support/till-fixtures";

const PHOTO = `/media/product-images/0199f000-0000-7000-8000-000000000001/${"c0ff".repeat(16)}.webp`;

const tile = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) });
const markOf = (element: HTMLElement) => element.querySelector<HTMLElement>("[data-initial]");

async function tillWithCoffeePhoto() {
  const server = cafeServer();
  await signedInTill(server);
  server.state.feed.push({
    entity: "catalog_product",
    entityId: MENU.coffee,
    snapshot: { ...COFFEE, version: 11, imageUrl: PHOTO },
  });
  await waitFor(() => expect(tile(COFFEE.name).querySelector("img")).not.toBeNull());
  return server;
}

describe("product photos on the till", () => {
  it("draws a product's photo on its tile and keeps the initials for one without", async () => {
    await tillWithCoffeePhoto();
    const coffee = tile(COFFEE.name);
    expect(coffee.querySelector("img")?.getAttribute("src")).toBe(`/api${PHOTO}`);
    expect(markOf(coffee)?.dataset.photo).toBe("shown");
    // The photo is decoration: the tile is still named by the product alone.
    expect(coffee.querySelector("img")?.getAttribute("alt")).toBe("");
    const cake = tile("Bánh croissant");
    expect(cake.querySelector("img")).toBeNull();
    expect(markOf(cake)?.dataset).toMatchObject({ photo: "none", initial: "BC" });
  });

  it("falls back to the initials when the photo cannot be drawn", async () => {
    await tillWithCoffeePhoto();
    const coffee = tile(COFFEE.name);
    fireEvent.error(coffee.querySelector("img") as HTMLImageElement);
    await waitFor(() => expect(coffee.querySelector("img")).toBeNull());
    expect(markOf(coffee)?.dataset).toMatchObject({ photo: "failed", initial: "CP" });
  });

  it("shows the photo at the head of the option screen and small on the cart line", async () => {
    await tillWithCoffeePhoto();
    fireEvent.click(tile(COFFEE.name));
    const head = await waitFor(() => {
      const found = document.querySelector<HTMLElement>(".pos-picker-head__mark");
      if (found === null) throw new Error("no option screen yet");
      return found;
    });
    expect(head.querySelector("img")?.getAttribute("src")).toBe(`/api${PHOTO}`);
    fireEvent.click(screen.getByRole("button", { name: /^Thêm vào đơn/ }));
    const line = await waitFor(() => {
      const found = document.querySelector<HTMLElement>(".pos-cart-line");
      if (found === null) throw new Error("no cart line yet");
      return found;
    });
    expect(line.querySelector(".pos-cart-line__photo img")?.getAttribute("src")).toBe(`/api${PHOTO}`);
  });

  it("draws a category with the photo of its first product that has one, else its icon", async () => {
    await tillWithCoffeePhoto();
    const category = (name: string) => screen.getByRole("tab", { name: new RegExp(`^${name}`) });
    for (const name of ["Tất cả", "Đồ uống"]) {
      const photo = category(name).querySelector(".pos-category__photo");
      expect(photo?.querySelector("img")?.getAttribute("src")).toBe(`/api${PHOTO}`);
      expect(photo?.getAttribute("data-category-photo")).toBe("shown");
    }
    const cakes = category("Bánh").querySelector(".pos-category__photo");
    expect(cakes?.querySelector("img")).toBeNull();
    expect(cakes?.querySelector("svg")).not.toBeNull();
  });
});
