// The sample café's product photos (scripts/src/dev-stack/seed/images), each under the
// address the API would give it. Pure data: the page and the photo server both read it.

export const SAMPLE_TENANT = "0199f000-0000-7000-8000-0000000ca000";

const FILES = [
  "ca-phe-den-da",
  "ca-phe-sua-da",
  "bac-xiu",
  "ca-phe-muoi",
  "americano",
  "latte",
  "cappuccino",
  "cold-brew-cam-sa",
  "tra-sua-tran-chau",
  "tra-sua-matcha",
  "tra-sua-o-long",
  "hong-tra-sua",
  "sua-tuoi-tran-chau-duong-den",
  "tra-dao-cam-sa",
  "tra-vai",
] as const;

export type PhotoFile = (typeof FILES)[number];

/** A stored photo's name is 64 hex characters; here the file's index, padded. */
const keyOf = (index: number) => `${(index + 1).toString(16).padStart(64, "0")}.webp`;

/** The address a product's photo is served at (under /api), by seed file name. */
export const PHOTO_URLS: Readonly<Record<PhotoFile, string>> = Object.fromEntries(
  FILES.map((file, index) => [file, `/media/product-images/${SAMPLE_TENANT}/${keyOf(index)}`]),
) as Record<PhotoFile, string>;

/** The seed file each served address stands for. */
export const PHOTO_FILES_BY_URL: ReadonlyMap<string, PhotoFile> = new Map(
  FILES.map((file) => [`/api${PHOTO_URLS[file]}`, file]),
);
