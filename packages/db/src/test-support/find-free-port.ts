import { createServer } from "node:net";

/**
 * A TCP port that is free right now. Other sessions on the same machine run their own
 * Postgres, so a fixed port would collide; the caller retries if the port is taken
 * between this check and the server binding it.
 */
export function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address === null || typeof address === "string") {
          reject(new Error("could not read the port of a probe server"));
        } else {
          resolve(address.port);
        }
      });
    });
  });
}
