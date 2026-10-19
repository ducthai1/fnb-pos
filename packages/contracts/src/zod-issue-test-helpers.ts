import type { ZodType, ZodTypeDef } from "zod";

/** What a schema said about an input: its value, or each issue's zod code and domain code. */
export function outcomeOf<T>(schema: ZodType<T, ZodTypeDef, unknown>, input: unknown) {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true as const, value: result.data };
  return {
    ok: false as const,
    issues: result.error.issues.map((issue) => ({
      code: issue.code,
      path: issue.path.join("."),
      domainCode:
        "params" in issue ? (issue.params?.["domainCode"] as string | undefined) : undefined,
    })),
  };
}

/** The domain codes an input was refused with; empty when it was refused by zod alone. */
export function domainCodesOf<T>(schema: ZodType<T, ZodTypeDef, unknown>, input: unknown) {
  const outcome = outcomeOf(schema, input);
  if (outcome.ok) throw new Error(`expected a refusal, got ${String(outcome.value)}`);
  return outcome.issues.flatMap((issue) =>
    issue.domainCode === undefined ? [] : [issue.domainCode],
  );
}

/** The dotted paths of the refused fields, to show a refusal names the field at fault. */
export function refusedPathsOf<T>(schema: ZodType<T, ZodTypeDef, unknown>, input: unknown) {
  const outcome = outcomeOf(schema, input);
  if (outcome.ok) throw new Error("expected a refusal, got a value");
  return outcome.issues.map((issue) => issue.path);
}
