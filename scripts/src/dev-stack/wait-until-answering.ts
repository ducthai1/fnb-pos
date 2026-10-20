import type { DevChildProcess } from "./dev-child-process";

/**
 * Waits until `url` answers below 500 (a first `next dev` request compiles the page, so it
 * can take a while), failing early when the child that should answer it has ended.
 */
export async function waitUntilAnswering(
  url: string,
  child: DevChildProcess,
  timeoutMs: number,
): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let ended = false;
  void child.exited.then(() => (ended = true));
  while (Date.now() < deadline) {
    if (ended)
      throw new Error(`${child.name} đã dừng trước khi sẵn sàng (xem log [${child.name}])`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(deadline - Date.now()) });
      if (response.status < 500) return response.status;
    } catch {
      // Not listening yet, or still compiling past the deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${child.name} không trả lời ${url} sau ${Math.round(timeoutMs / 1000)} giây`);
}
