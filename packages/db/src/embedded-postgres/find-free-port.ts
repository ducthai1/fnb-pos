import { createServer } from "node:net";

/**
 * A TCP port that is free right now. Other sessions on the same machine run their own
 * Postgres, so a fixed port would collide; the caller retries if the port is taken
 * between this check and the server binding it.
 */
export function findFreePort(): Promise<number> {
  return listenOnce(0).then((port) => {
    if (port === null) throw new Error("could not read the port of a probe server");
    return port;
  });
}

/** Whether `port` on 127.0.0.1 can be bound right now. */
export async function isPortFree(port: number): Promise<boolean> {
  return (await listenOnce(port).catch(() => null)) !== null;
}

function listenOnce(port: number): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        resolve(address === null || typeof address === "string" ? null : address.port);
      });
    });
  });
}
