import { HOSTILE_PRODUCT } from "../../../src/test-support/hostile-menu";
import { MENU, tid } from "../../../src/test-support/till-fixtures";

// Photos at their worst: one ten times taller than wide, one ten times wider than tall, and
// one the server no longer has. The screens page's server draws the first two.

const TENANT = "0199f000-0000-7000-8000-0000000fa000";
const address = (seed: string, extension: string) =>
  `/media/product-images/${TENANT}/${seed.repeat(64 / seed.length)}.${extension}`;

export const HOSTILE_PHOTOS = {
  tall: { url: address("7a11", "png"), width: 60, height: 600 },
  wide: { url: address("91de", "png"), width: 600, height: 60 },
  missing: { url: address("0000", "webp"), width: 0, height: 0 },
} as const;

/** Which product shows which photo: the long-named one gets the tall photo. */
export const PHOTOS_BY_PRODUCT: Readonly<Record<string, string>> = {
  [HOSTILE_PRODUCT.id]: HOSTILE_PHOTOS.tall.url,
  [tid(0x404)]: HOSTILE_PHOTOS.wide.url,
  [MENU.coffee]: HOSTILE_PHOTOS.missing.url,
};
