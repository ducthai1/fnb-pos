import { randomBytes, randomInt } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pinProblem } from "@fnb/api/pin-rules";
import { newId } from "@fnb/db";
import { z } from "zod";

const loginsSchema = z.object({
  postgres: z.object({
    superuserPassword: z.string().min(16),
    ownerPassword: z.string().min(16),
    appPassword: z.string().min(16),
  }),
  owner: z.object({
    accountId: z.string().uuid(),
    organizationId: z.string().uuid(),
    email: z.string().email(),
    password: z.string().min(12),
  }),
  staffPins: z.object({ cashier: z.string(), barista: z.string(), manager: z.string() }),
  /** 32 bytes in base64: what the API seals gateway secrets with. */
  paymentSecretKey: z.string(),
  /** The API key the sample branch set on its SePay webhook. */
  sepaySecret: z.string().min(16),
});

/**
 * Passwords, PINs and keys of a stack that only ever runs on this machine, generated at
 * random on its first run and kept beside its data, so a rerun signs in with what it
 * printed last time. None of them is ever a value a real deployment uses.
 */
export type DevStackLogins = z.infer<typeof loginsSchema>;

export function generateDevStackLogins(): DevStackLogins {
  const random = () => randomBytes(18).toString("base64url");
  const pins = new Set<string>();
  while (pins.size < 3) pins.add(acceptablePin());
  const [cashier, barista, manager] = [...pins] as [string, string, string];
  return {
    postgres: { superuserPassword: random(), ownerPassword: random(), appPassword: random() },
    owner: {
      accountId: newId(),
      organizationId: newId(),
      email: "chu-quan@ca-phe-mau.test",
      password: `Mau-${randomBytes(9).toString("base64url")}`,
    },
    staffPins: { cashier, barista, manager },
    paymentSecretKey: randomBytes(32).toString("base64"),
    sepaySecret: `sepay-dev-${random()}`,
  };
}

/** The stack's logins, generated and saved (readable by this user only) when missing. */
export async function loadOrGenerateDevStackLogins(
  file: string,
): Promise<{ logins: DevStackLogins; generated: boolean }> {
  let text: string | null = null;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (text !== null) {
    const parsed = loginsSchema.safeParse(JSON.parse(text));
    if (!parsed.success) {
      throw new Error(`${file} is not readable; run pnpm dev:stack --reset to start over`);
    }
    return { logins: parsed.data, generated: false };
  }
  const logins = generateDevStackLogins();
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(logins, null, 2)}\n`, { mode: 0o600 });
  return { logins, generated: true };
}

/** Six random digits the staff rules take (no run, repeat or year). */
function acceptablePin(): string {
  for (;;) {
    const pin = String(randomInt(0, 1_000_000)).padStart(6, "0");
    if (pinProblem(pin) === null) return pin;
  }
}
