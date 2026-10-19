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
