import type { ApiResult } from "./api-result";

/** Two reads a page needs together: both values, or the first failure. */
export async function bothResults<A, B>(
  first: Promise<ApiResult<A>>,
  second: Promise<ApiResult<B>>,
): Promise<ApiResult<readonly [A, B]>> {
  const [a, b] = await Promise.all([first, second]);
  if (!a.ok) return a;
  if (!b.ok) return b;
  return { ok: true, value: [a.value, b.value] };
}
