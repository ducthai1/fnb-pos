import { type SignedInMember, signedInMemberSchema } from "@fnb/contracts";
import {
  type ApiFailure,
  type ApiResult,
  type FetchLike,
  noContent,
  requestJson,
  resultOf,
} from "./api-result";
import { isRecord, listOf, parsedBy, textOf } from "./read-json-fields";

export interface Organization {
  readonly id: string;
  readonly name: string;
}

/** The member signed in, with the keys their role holds as GET /auth/me reported them. */
export type SignedInUser = Readonly<Omit<SignedInMember, "permissionKeys">> & {
  readonly permissionKeys: readonly SignedInMember["permissionKeys"][number][];
};

export interface LoginInput {
  /** What the person typed: an email address or a phone number. */
  readonly identifier: string;
  readonly password: string;
  readonly organizationId?: string;
}

export type LoginOutcome =
  | { readonly kind: "signed-in" }
  | { readonly kind: "choose-organization"; readonly organizations: readonly Organization[] }
  | { readonly kind: "failed"; readonly failure: ApiFailure };

const ORGANIZATION_REQUIRED = "API_AUTH_ORGANIZATION_REQUIRED";

/** The API takes one of the two: anything with an @ is an email, the rest a phone number. */
export function loginBody(input: LoginInput): Record<string, string> {
  const identifier = input.identifier.trim();
  return {
    ...(identifier.includes("@") ? { email: identifier } : { phone: identifier }),
    password: input.password,
    ...(input.organizationId === undefined ? {} : { organizationId: input.organizationId }),
  };
}

const readOrganization = (item: Record<string, unknown>): Organization | null => {
  const id = textOf(item, "id");
  const name = textOf(item, "name");
  return id === null || name === null ? null : { id, name };
};

export interface AuthApi {
  login(input: LoginInput): Promise<LoginOutcome>;
  logout(): Promise<ApiResult<true>>;
  me(): Promise<ApiResult<SignedInUser>>;
}

export function httpAuthApi(base: string, fetchImpl: FetchLike): AuthApi {
  return {
    async login(input) {
      const answer = await requestJson(fetchImpl, `${base}/auth/login`, {
        method: "POST",
        body: loginBody(input),
      });
      const result = resultOf(answer, (body) => (isRecord(body) ? true : null));
      if (result.ok) return { kind: "signed-in" };
      if (result.status === 409 && result.code === ORGANIZATION_REQUIRED && isRecord(answer.body)) {
        const organizations = listOf(answer.body.organizations, readOrganization);
        if (organizations !== null) return { kind: "choose-organization", organizations };
      }
      return { kind: "failed", failure: result };
    },
    async logout() {
      return resultOf(await requestJson(fetchImpl, `${base}/auth/logout`, { method: "POST" }), noContent);
    },
    async me() {
      const answer = await requestJson(fetchImpl, `${base}/auth/me`, { method: "GET" });
      return resultOf(answer, (body) => parsedBy(signedInMemberSchema, body));
    },
  };
}
