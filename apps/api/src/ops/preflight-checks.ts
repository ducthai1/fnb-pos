import type { ServerConfigResult } from "../server/server-config";

export type CheckStatus = "pass" | "warn" | "fail";

export interface CheckResult {
  readonly status: CheckStatus;
  readonly name: string;
  readonly detail: string;
}

/** What was found out about a deployment; null where the check could not be run. */
export interface PreflightFacts {
  readonly config: ServerConfigResult;
  readonly role: { readonly superuser: boolean; readonly bypassesRls: boolean } | Failure | null;
  /** Migration files not in the ledger, and ledger entries no file has (a newer database). */
  readonly migrations: { readonly pending: string[]; readonly unknown: string[] } | Failure | null;
  readonly health: { readonly status: number } | Failure | null;
}

export interface Failure {
  readonly error: string;
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

const failed = (value: object | null): value is Failure => value !== null && "error" in value;

/** Every check, in the order an operator fixes them: configuration, database, process. */
export function preflightChecks(facts: PreflightFacts): CheckResult[] {
  return [
    ...configChecks(facts.config),
    roleCheck(facts),
    migrationCheck(facts),
    healthCheck(facts),
  ];
}

function configChecks(result: ServerConfigResult): CheckResult[] {
  if (!result.ok) {
    return [{ status: "fail", name: "cấu hình API", detail: result.problems.join("; ") }];
  }
  const { config } = result;
  const behindProxy = LOOPBACK_HOSTS.has(config.host);
  const plainOrigins = (config.allowedOrigins ?? []).filter((o) => !o.startsWith("https://"));
  return [
    { status: "pass", name: "cấu hình API", detail: "mọi biến bắt buộc có và hợp lệ" },
    config.environment === "production"
      ? { status: "pass", name: "FNB_ENV", detail: "production" }
      : { status: "fail", name: "FNB_ENV", detail: "phải là production trên server thật" },
    plainOrigins.length === 0
      ? { status: "pass", name: "FNB_ALLOWED_ORIGINS", detail: "chỉ https" }
      : {
          status: "fail",
          name: "FNB_ALLOWED_ORIGINS",
          detail:
            `${plainOrigins.join(", ")} không phải https: trình duyệt không gửi cookie ` +
            "Secure qua http, backoffice sẽ không đăng nhập được",
        },
    config.paymentSecretKey !== null
      ? { status: "pass", name: "FNB_PAYMENT_SECRET_KEY", detail: "có" }
      : {
          status: "warn",
          name: "FNB_PAYMENT_SECRET_KEY",
          detail: "thiếu: báo có của ngân hàng không được nhận, QR không tự xác nhận",
        },
    !behindProxy || config.rateLimits.trustedProxies.length > 0
      ? { status: "pass", name: "FNB_TRUSTED_PROXIES", detail: "địa chỉ khách đọc đúng" }
      : {
          status: "fail",
          name: "FNB_TRUSTED_PROXIES",
          detail:
            `API nghe ở ${config.host} sau proxy nhưng không tin proxy nào: mọi khách cùng ` +
            "một địa chỉ, giới hạn tần suất theo địa chỉ sẽ chặn cả quán (đặt 127.0.0.1,::1)",
        },
    config.cleanup !== null
      ? { status: "pass", name: "dọn mã ghép và phiên hết hạn", detail: "bật" }
      : {
          status: "warn",
          name: "dọn mã ghép và phiên hết hạn",
          detail: "tắt: chỉ đúng khi một tiến trình khác của cùng database đang bật",
        },
  ];
}

function roleCheck({ role }: PreflightFacts): CheckResult {
  const name = "role database của API";
  if (role === null)
    return { status: "fail", name, detail: "chưa kiểm được: cấu hình chưa hợp lệ" };
  if (failed(role)) return { status: "fail", name, detail: `không kết nối được: ${role.error}` };
  if (role.superuser || role.bypassesRls) {
    return { status: "fail", name, detail: "là SUPERUSER hoặc BYPASSRLS: RLS không ràng buộc nó" };
  }
  return { status: "pass", name, detail: "không SUPERUSER, không BYPASSRLS" };
}

function migrationCheck({ migrations }: PreflightFacts): CheckResult {
  const name = "migration";
  if (migrations === null) {
    return {
      status: "fail",
      name,
      detail: "chưa kiểm được: đặt FNB_ADMIN_DATABASE_URL (role đọc được sổ migration)",
    };
  }
  if (failed(migrations)) return { status: "fail", name, detail: migrations.error };
  if (migrations.unknown.length > 0) {
    const names = migrations.unknown.join(", ");
    return {
      status: "fail",
      name,
      detail: `database mới hơn code (có ${names}): đang chạy bản cũ?`,
    };
  }
  if (migrations.pending.length > 0) {
    const names = migrations.pending.join(", ");
    return { status: "fail", name, detail: `chưa chạy: ${names} (chạy pnpm db:provision)` };
  }
  return { status: "pass", name, detail: "đã chạy hết" };
}

function healthCheck({ health }: PreflightFacts): CheckResult {
  const name = "/health";
  if (health === null)
    return { status: "fail", name, detail: "chưa kiểm được: cấu hình chưa hợp lệ" };
  if (failed(health)) return { status: "fail", name, detail: `không gọi được: ${health.error}` };
  return health.status === 200
    ? { status: "pass", name, detail: "200" }
    : { status: "fail", name, detail: `trả ${health.status}: API chưa chạy hoặc mất database` };
}
