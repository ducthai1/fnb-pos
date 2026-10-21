import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SAMPLE_PRODUCTS } from "./sample-menu-data";
import { SAMPLE_PHOTOS } from "./seed-sample-photos";

const IMAGES = join(dirname(fileURLToPath(import.meta.url)), "images");

describe("the sample shop's photos", () => {
  it("give every sample product a photo, each a file in images/", async () => {
    expect(Object.keys(SAMPLE_PHOTOS).sort()).toEqual(SAMPLE_PRODUCTS.map((p) => p.name).sort());
    const files = (await readdir(IMAGES)).filter((name) => name !== "CREDITS.md");
    expect(files.sort()).toEqual(Object.values(SAMPLE_PHOTOS).sort());
  });

  it("are small WebP files, by their bytes, and all of them together stay small", async () => {
    let total = 0;
    for (const file of Object.values(SAMPLE_PHOTOS)) {
      const bytes = await readFile(join(IMAGES, file));
      expect(bytes.subarray(0, 4).toString("ascii"), file).toBe("RIFF");
      expect(bytes.subarray(8, 12).toString("ascii"), file).toBe("WEBP");
      expect(bytes.length, file).toBeLessThanOrEqual(120_000);
      total += bytes.length;
    }
    expect(total).toBeLessThanOrEqual(1_500_000);
  });

  it("are each credited with a source and a CC0 licence", async () => {
    const credits = await readFile(join(IMAGES, "CREDITS.md"), "utf8");
    for (const file of Object.values(SAMPLE_PHOTOS)) {
      const line = credits.split("\n").find((row) => row.includes(`\`${file}\``));
      expect(line, file).toMatch(
        /\[CC0 1\.0\]\(https:\/\/creativecommons\.org\/publicdomain\/zero\/1\.0/,
      );
      expect(line, file).toMatch(
        /\]\(https:\/\/(www\.flickr\.com|commons\.wikimedia\.org|www\.rawpixel\.com|stocksnap\.io)\//,
      );
    }
  });
});
