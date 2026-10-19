import { afterEach, describe, expect, it, vi } from "vitest";
import { idTimestampMillis, newId } from "./new-id";

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UUID_V4 = "0f8fad5b-d9cb-469f-a165-70867728950e";

afterEach(() => {
  vi.useRealTimers();
});

describe("newId", () => {
  it("produces a lowercase RFC 9562 version 7 uuid with the RFC variant bits", () => {
    for (let i = 0; i < 100; i++) expect(newId()).toMatch(UUID_V7);
  });

  it("does not accept a random version 4 uuid as the expected shape", () => {
    expect(UUID_V4).not.toMatch(UUID_V7);
  });

  it("embeds the creation millisecond in the first 48 bits", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const createdAt = Date.UTC(2026, 9, 20, 3, 15, 0, 123);
    vi.setSystemTime(createdAt);
    expect(idTimestampMillis(newId())).toBe(createdAt);
  });

  it("sorts ids created later after ids created earlier", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.UTC(2026, 9, 20, 3, 0));
    const earlier = newId();
    vi.setSystemTime(Date.UTC(2026, 9, 20, 3, 1));
    const later = newId();
    expect(earlier < later).toBe(true);
  });

  it("stays strictly increasing for many ids created in the same millisecond", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.UTC(2026, 9, 20, 4, 0));
    const ids = Array.from({ length: 2000 }, () => newId());
    for (let i = 1; i < ids.length; i++) expect(ids[i - 1]! < ids[i]!).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("stays strictly increasing when the device clock steps backwards", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.UTC(2026, 9, 20, 5, 0));
    const beforeStep = newId();
    vi.setSystemTime(Date.UTC(2026, 9, 20, 4, 59));
    const afterStep = newId();
    expect(beforeStep < afterStep).toBe(true);
  });
});
