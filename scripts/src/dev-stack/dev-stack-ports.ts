import { findFreePort, isPortFree } from "@fnb/db/embedded-postgres";

/** Fixed ports when free, so bookmarks keep working; another free one when taken. */
export const PREFERRED_PORTS = { postgres: 54_329, api: 4_300, pos: 5_173, backoffice: 3_300 };

export type DevStackPorts = Record<keyof typeof PREFERRED_PORTS, number>;

export async function chooseDevStackPorts(): Promise<DevStackPorts> {
  const chosen = new Set<number>();
  const pick = async (preferred: number) => {
    let port = (await isPortFree(preferred)) ? preferred : await findFreePort();
    while (chosen.has(port)) port = await findFreePort();
    chosen.add(port);
    return port;
  };
  return {
    postgres: await pick(PREFERRED_PORTS.postgres),
    api: await pick(PREFERRED_PORTS.api),
    pos: await pick(PREFERRED_PORTS.pos),
    backoffice: await pick(PREFERRED_PORTS.backoffice),
  };
}
