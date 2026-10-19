# Kiến trúc & lựa chọn stack

> Đầu vào: [logic-catalog](logic-catalog-flows-rules-and-design-decisions.md) + trả lời của user 2026-10-19: SaaS nhiều quán · bắt đầu 1 quán · quầy dùng Windows, tablet Android, iPad, điện thoại · "linh hoạt nhất, đa nền tảng, online + offline đều được". User giao Claude chọn stack.
> Trạng thái: đề xuất, chờ duyệt. Ba chỗ phải chứng minh bằng spike ở phase 00 trước khi khóa (đánh dấu **[SPIKE]**).

## 1. Quyết định gốc: TypeScript ở mọi tầng

Lý do quyết định (không phải sở thích):
- POS phải **tự tính tiền khi mất mạng**: giá, topping, thuế/phí theo kênh, làm tròn, khuyến mãi, phân bổ giảm giá. Server phải **tính lại y hệt** để không tin client. ⇒ Một gói `domain` viết một lần, chạy cả ở máy quầy lẫn server. Chỉ TS làm được điều này mà không viết hai lần.
- Backoffice, trang khách gọi món QR, POS dùng chung component và kiểu dữ liệu.
- Đội GrowX đã quen Next.js / TS.

Đã cân nhắc và loại:

| Phương án | Vì sao không |
|---|---|
| Flutter | Rất hợp POS (phần cứng, Windows/Android/iOS từ một mã), nhưng Dart ≠ TS ⇒ engine tính tiền phải viết 2 lần (client Dart, server TS/Go) hoặc chỉ chạy ở server ⇒ mất offline. |
| React Native / Expo | Không có đường Windows trưởng thành với Expo; react-native-windows là nhánh riêng. |
| Web thuần (PWA) | Không in raw ra máy in LAN được (HTTPS → HTTP trong LAN bị chặn mixed content), WebUSB/Bluetooth chỉ Chromium và cần người bấm [research D]. ⇒ PWA chỉ dùng cho vai trò không cần in. |
| Go backend | Tốt, nhưng mất lợi thế chạy chung engine với client. |

## 2. Hình dạng hệ thống

```
                      ┌──────────────────── Cloud (SaaS) ─────────────────────┐
 Backoffice (Next.js) │  API (Node + Fastify)  ── PostgreSQL (RLS theo tenant) │
 Chủ quán / quản lý ──┤  Sync endpoints        ── Job queue (pg-boss)          │
                      │  Webhook: SePay/PayOS, nhà cung cấp HĐĐT, GrabFood     │
 Khách gọi món QR ────┤  Realtime ping (WebSocket/SSE: "có thay đổi")          │
 (web, online)        └────────────────────────────▲──────────────────────────┘
                                                   │ HTTPS (khi có mạng)
              ┌────────────────────────────────────┴───────────────────┐
              │ Quán                                                    │
              │  POS app = React SPA (cùng một mã) chạy trong:          │
              │   • Tauri 2  → Windows                                  │
              │   • Capacitor → Android tablet, máy POS Sunmi/iMin, iPad │
              │   • Trình duyệt (PWA) → điện thoại order, màn bếp       │
              │  Mỗi máy: SQLite cục bộ + hàng đợi lệnh (outbox)        │
              │  Máy có vỏ native ──TCP 9100 / Bluetooth / USB──► máy in │
              │                                      └─► két tiền       │
              └─────────────────────────────────────────────────────────┘
```

## 3. Stack cụ thể

| Tầng | Chọn | Ghi chú |
|---|---|---|
| Monorepo | pnpm + Turborepo | `apps/*`, `packages/*` |
| Lõi nghiệp vụ | `packages/domain` — TS thuần, không I/O | giá, thuế/phí, làm tròn, khuyến mãi, phân bổ, máy trạng thái đơn, ngày kinh doanh, số học hoàn tiền |
| Kiểu & kiểm tra | zod | chung cho API, sync, form |
| POS | React + Vite SPA, TanStack Router/Query | không cần SSR; offline-first |
| Vỏ Windows | **Tauri 2** [SPIKE] | Rust cho TCP/USB/serial; dự phòng: Electron |
| Vỏ Android/iOS | **Capacitor** | plugin SQLite, Bluetooth, máy in tích hợp Sunmi/iMin |
| DB cục bộ | SQLite (plugin native trong vỏ; SQLite WASM + OPFS trong trình duyệt) [SPIKE] | một interface repository chung |
| Backoffice | Next.js (App Router) | đội quen; dùng chung `packages/ui` |
| Trang khách QR | Vite SPA nhẹ hoặc route Next.js | online-only |
| API | Node 22 + Fastify + zod → OpenAPI | REST; đối tác/webhook cần REST rõ ràng |
| ORM | Drizzle | Postgres ở server, SQLite ở client |
| DB | PostgreSQL 17 | `tenant_id` mọi bảng + Row-Level Security (ENABLE + FORCE), role `fnb_owner` / `fnb_app`, khóa ngoại kép (D-019); test chạy Postgres nhúng (D-017) |
| Hàng đợi | pg-boss (trên Postgres) | KISS: không thêm Redis lúc đầu |
| In | `packages/printing`: mẫu → ESC/POS (bill, bếp) + **TSPL** (máy in tem dán ly) [SPIKE] | vỏ native chỉ "đẩy byte" |
| Test | Vitest (+ fast-check cho domain), Playwright (POS bản web), test tích hợp với Postgres thật | |

## 4. Quy ước dữ liệu

- Tiền: **số nguyên đồng** (`bigint`), không float. Số lượng: `numeric(12,3)` (gram, ml, kg). Phần trăm: basis point (1% = 100).
- ID: **UUIDv7** tạo ở máy (sắp theo thời gian, dùng được khi offline).
- Mọi bảng nghiệp vụ: `tenant_id`, `branch_id` (nếu có), `created_by`, `created_at`, `business_date` (với chứng từ), `version`.
- Chứng từ đã chốt bất biến; sửa bằng chứng từ đảo (catalog §2).
- Số đơn 3 lớp: `uuid` · `device_order_no` · `official_no` + `call_number` (catalog §5).

## 5. Đồng bộ (thiết kế tự làm, KISS)

- **Chiều xuống** (server → máy): menu, giá, cấu hình, nhân viên, bàn, khuyến mãi. Mỗi tenant có `change_seq` tăng dần; máy kéo "thay đổi từ cursor X". Lần đầu: tải bản chụp.
- **Chiều lên** (máy → server): hàng đợi **lệnh** `{command_id, type, payload, device_seq, business_date}`. Server áp dụng **idempotent theo command_id**, tính lại bằng `packages/domain`. Kết quả: `accepted` hoặc `rejected(reason)`; bị từ chối thì hiện ở màn "cần xử lý", không âm thầm bỏ.
- **Khi có mạng:** đơn đang mở trên bàn thì server là nguồn thật, khóa lạc quan bằng `version`; xung đột báo **ngay khi lưu**.
- **Khi mất mạng:** mỗi máy bán đơn của chính nó; đơn tạo offline thì máy khác chỉ thấy sau khi đồng bộ (giống Toast [research D]). Đơn offline giữ `business_date` và ca **lúc bán**, không phải lúc gửi lên.
- Chế độ "máy chính trong LAN" để nhiều máy chia sẻ bàn khi mất internet: để ở phase 06, có thể tách ra sau.
- Đã cân nhắc PowerSync / Zero / ElectricSQL: chưa chọn vì POS cần **lệnh được server kiểm**, không chỉ đồng bộ hàng dữ liệu. Spike S2 (2026-10-20, `research/spike-s2-local-db-sync-report.md`) xác nhận thiết kế tự làm: 0 mất / 0 trùng dưới lỗi mạng. Chi tiết giao thức đã đo: D-021. Còn bẫy 12 (kéo bị đói khi hàng đợi bận) phải sửa trước R1 — xem Backlog của bảng task.

## 6. In ấn & thiết bị

- `print_job` ghi trước khi gửi, có trạng thái + thử lại, in lỗi thì báo lỗi.
- Đường in: TCP 9100 (máy in LAN) · Bluetooth SPP (Android) · USB/serial (Windows) · SDK máy in tích hợp (Sunmi/iMin).
- Máy không có vỏ native (điện thoại dùng PWA) gửi lệnh in qua server tới một **máy trạm in** trong quán (khi online).
- Máy in tem dán ly phổ biến dùng TSPL, không phải ESC/POS — phải thử với máy thật [SPIKE].
- Két tiền: lệnh mở két qua máy in.

## 7. Thanh toán & hóa đơn điện tử

- **VietQR động sinh ngay trên máy** (chuỗi EMVCo + CRC) ⇒ hiện QR được cả khi offline; xác nhận tự động cần mạng (webhook SePay/PayOS/Casso) ⇒ offline thì thu ngân xác nhận tay, đối soát sau.
- Hóa đơn điện tử tích hợp **ở server** qua một nhà cung cấp (chọn theo quán thí điểm); máy offline giữ hàng đợi. [MỞ] mã hóa đơn từ máy tính tiền có sinh được trên máy khi offline không — cần kế toán + sandbox nhà cung cấp.

## 8. Đa tenant & bảo mật

- Một DB chung, `tenant_id` + RLS; test âm bắt buộc: tenant A không đọc được dữ liệu B.
- Đăng nhập backoffice: SĐT/email + mật khẩu (+ OTP). Máy quầy: **ghép thiết bị** bằng mã ghép một lần ⇒ token thiết bị thu hồi được. Nhân viên: PIN trên thiết bị đã ghép, giới hạn số lần thử, không gửi băm PIN xuống máy.
- Bí mật của tenant (khóa nhà cung cấp HĐĐT, khóa webhook) mã hóa khi lưu.
- Webhook: kiểm chữ ký/khóa, idempotent.
- [MỞ] Pháp lý dữ liệu: dữ liệu cá nhân khách hàng (SĐT tích điểm) và yêu cầu lưu trữ trong nước — cần kiểm Luật Bảo vệ dữ liệu cá nhân và các quy định an ninh mạng hiện hành trước khi chọn nơi đặt máy chủ.

## 9. Cấu trúc repo dự kiến

```
apps/
  api/            Fastify, sync, webhook, job
  backoffice/     Next.js — menu, kho, báo cáo, cấu hình, nhân viên
  pos/            React SPA — bán hàng, bàn, ca, in
  pos-shell-tauri/      vỏ Windows
  pos-shell-capacitor/  vỏ Android/iOS
  qr-order/       khách tự gọi món
packages/
  domain/         lõi nghiệp vụ thuần (test dày nhất)
  contracts/      zod schema cho API + lệnh sync
  db/             Drizzle schema server + client
  sync-client/    outbox, pull theo cursor, giải quyết từ chối
  printing/       mẫu in → ESC/POS / TSPL
  ui/             component dùng chung
  feature-flags/  danh mục công tắc + ràng buộc phụ thuộc/loại trừ
  shop-templates/ mẫu loại quán (dữ liệu JSON)
```
