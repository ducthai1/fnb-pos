/** The SQLSTATE of a failed query (e.g. "42501" insufficient privilege), or a marker. */
export async function postgresErrorCode(work: () => Promise<unknown>): Promise<string> {
  try {
    await work();
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : "not-a-postgres-error";
  }
  return "no-error";
}

/** SQLSTATE and message, for refusals that share a generic code such as P0001. */
export async function postgresRefusal(
  work: () => Promise<unknown>,
): Promise<{ code: string; message: string }> {
  try {
    await work();
  } catch (error) {
    const { code, message } = error as { code?: unknown; message?: unknown };
    return {
      code: typeof code === "string" ? code : "not-a-postgres-error",
      message: String(message),
    };
  }
  return { code: "no-error", message: "" };
}
