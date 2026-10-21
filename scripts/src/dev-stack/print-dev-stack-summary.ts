import type { DevStackLogins } from "./dev-stack-generated-logins";
import type { DevStackPorts } from "./dev-stack-ports";
import type { SampleShop } from "./seed/seed-sample-shop";

const at = (port: number) => `http://127.0.0.1:${port}`;

const vietnamTime = (iso: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

/**
 * What the owner needs to try the system, printed on every run: where each part listens,
 * how to sign in, the staff PINs and a fresh pairing code. The values are the stack's own
 * random ones from tmp/dev-stack, never anything a real deployment uses.
 */
export function printDevStackSummary(
  ports: DevStackPorts,
  logins: DevStackLogins,
  shop: SampleShop,
): void {
  const code = shop.pairingCode.code;
  const lines = [
    "",
    "Cà phê Mẫu đang chạy trên máy này. Ctrl+C để dừng tất cả.",
    "",
    `  Máy quầy (POS)   ${at(ports.pos)}`,
    `  Backoffice       ${at(ports.backoffice)}`,
    `  API              ${at(ports.api)}/health`,
    `  Postgres         127.0.0.1:${ports.postgres} (dữ liệu giữ ở tmp/dev-stack)`,
    "",
    "  Chủ quán đăng nhập backoffice:",
    `    Email      ${logins.owner.email}`,
    `    Mật khẩu   ${logins.owner.password}`,
    "",
    "  Nhân viên đăng nhập máy quầy bằng PIN:",
    ...shop.staff.map(
      (member) => `    ${member.displayName.padEnd(6)} ${member.roleName.padEnd(11)} ${member.pin}`,
    ),
    "",
    `  Mã ghép máy quầy (mới, dùng một lần, hết hạn lúc ${vietnamTime(shop.pairingCode.expiresAt)}):`,
    `    ${code.slice(0, 4)}-${code.slice(4)}`,
    "",
    `  Thực đơn ${shop.productCount} món (${shop.photoCount} có ảnh), ${shop.tableCount} bàn ở 2 khu; ` +
      "tài khoản nhận tiền và hóa đơn điện tử là GIẢ.",
    "  Thử QR tự xác nhận: pnpm dev:bank-notice <mã nội dung FNB…> <số tiền>",
    "  Làm lại từ đầu (xóa dữ liệu): pnpm dev:stack --reset",
    "",
  ];
  console.log(lines.join("\n"));
}
