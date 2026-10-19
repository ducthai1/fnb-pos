// The page only relays between Playwright and the worker that owns the database.
type Reply = { id: number; ok: boolean; value?: unknown; error?: string };

const worker = new Worker("/spike/opfs-worker.js", { type: "module" });
const waiting = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
let nextId = 1;

worker.onmessage = (event: MessageEvent<Reply>) => {
  const entry = waiting.get(event.data.id);
  waiting.delete(event.data.id);
  if (event.data.ok) entry?.resolve(event.data.value);
  else entry?.reject(new Error(event.data.error));
};
worker.onerror = (event) => {
  for (const entry of waiting.values()) entry.reject(new Error(`worker error: ${event.message}`));
  waiting.clear();
};

(window as unknown as { runPhase: unknown }).runPhase = (phase: string, args: Record<string, unknown> = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    waiting.set(id, { resolve, reject });
    worker.postMessage({ id, phase, args });
  });
