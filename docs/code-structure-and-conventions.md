# Cấu trúc code & quy ước

> Đọc trước khi viết dòng code đầu tiên của mỗi phiên. Cập nhật mục "Bản đồ code" mỗi khi thêm/đổi một module.

## 1. Bản đồ code (cập nhật liên tục)

```
apps/
  api/                    Fastify. src/routes/<miền>/, src/sync/, src/jobs/, src/webhooks/; test/integration/<miền>/
  backoffice/             Next.js App Router. app/(<miền>)/, components/<miền>/
  pos/                    React SPA. src/screens/<màn>/, src/features/<miền>/, src/local-db/, src/shell-bridge/
  pos-shell-tauri/        vỏ Windows (Rust: printer, drawer, secure storage, sqlite)
  pos-shell-capacitor/    vỏ Android/iOS (plugin: printer TCP/Bluetooth/Sunmi, sqlite, secure storage)
  qr-order/               khách gọi món (R3)
packages/
  domain/                 lõi nghiệp vụ THUẦN — không import gì có I/O
  contracts/              zod schema: API, lệnh sync, sự kiện
  db/                     Drizzle schema server (pg) + client (sqlite), migration
  sync-client/            outbox, pull theo cursor, xử lý từ chối
  printing/               mẫu in → ESC/POS / TSPL; ảnh golden
  feature-flags/          danh mục công tắc + ràng buộc
  shop-templates/         dữ liệu mẫu loại quán (JSON)
  ui/                     component dùng chung (POS + backoffice)
  test-fixtures/          dữ liệu test dùng chung, gồm bộ dữ liệu XẤU
e2e/
  pos/  backoffice/       Playwright
```

Trạng thái thực tế (2026-10-20): chỉ có khung monorepo + `packages/domain` (mới có `DOMAIN_VERSION` và luật eslint giữ domain thuần). Các app/package khác tạo khi task tương ứng bắt đầu.

## 2. Ranh giới module (không được phá)

- `domain` không import `db`, `api`, React, `fetch`, `Date.now()`; thời gian và dữ liệu được truyền vào.
- Tính tiền **chỉ** ở `domain`. UI, API, sync gọi `domain`, không tự cộng trừ tiền.
- `apps/pos` không gọi API trực tiếp để ghi: mọi ghi đi qua `sync-client` (lệnh vào outbox).
- Vỏ native chỉ làm việc phần cứng (in, két, lưu bảo mật, SQLite). Không có logic nghiệp vụ trong Rust/Java/Swift.
- `contracts` là nguồn duy nhất của hình dạng dữ liệu đi qua mạng.

## 3. Dữ liệu

- Tiền: `bigint` đồng (VND không có số lẻ). Không float, không `number` cho tiền trong DB.
- Số lượng: decimal 3 chữ số (`numeric(12,3)`; trong TS dùng kiểu Decimal của `domain`).
- Tỉ lệ: basis point (`10000` = 100%).
- ID: UUIDv7, tạo ở nơi sinh ra bản ghi (kể cả máy offline).
- Mọi bảng nghiệp vụ: `tenant_id`, `created_at`, `created_by`, `updated_at`, `version`; chứng từ thêm `branch_id`, `business_date`.
- Bất biến: bản ghi chứng từ đã chốt không `UPDATE` nội dung tiền/số lượng; sửa = chứng từ đảo.
- Migration: tên theo miền, không theo phase: `0007_kitchen_ticket.sql`, không phải `0007_phase04.sql`.

## 4. Đặt tên

- File/thư mục: kebab-case, tên dài mô tả được (`compute-order-totals.ts`, `void-line-after-sent.test.ts`).
- Mỗi file < 200 dòng; vượt thì tách theo trách nhiệm.
- Mã lỗi nghiệp vụ: `DOMAIN_<MIỀN>_<LÝ_DO>` (vd `DOMAIN_ORDER_ALREADY_PAID`). Lớp `DomainError` ở `domain/src/errors.ts`; **mã khai cạnh luật** ở `domain/src/<miền>/<miền>-error-codes.ts` (vd `money/money-error-codes.ts`) để hai việc song song không đụng một file chung. UI tra mã ra câu tiếng Việt ở `ui/src/messages/vi.ts`.
- Mỗi miền trong `domain/src/<miền>/` có `index.ts` riêng; `domain/src/index.ts` chỉ re-export các miền.
- Tiền dùng `Vnd` (bigint có brand), số lượng dùng `Quantity` (bigint phần nghìn, 1 món = 1000n), tỉ lệ dùng `BasisPoints`; chia luôn qua `divideRounded(n, d, mode)` với mode tường minh — không bao giờ dùng `/` trên tiền ở chỗ khác.
- Chuỗi hiển thị: tiếng Việt, gom ở `messages/vi.ts`; không viết cứng chuỗi trong component.
- Code, comment, commit, tên test: tiếng Anh.

## 5. Comment & tham chiếu

- Comment giải thích **vì sao** (luật, bẫy, đánh đổi), không phải **từ đâu**. Không ghi số phase, mã task, mã quyết định (`T04-07`, `D-010`, "phase 04") trong code, test, tên file, migration, commit — những mã đó đổi/biến mất. Viết "stock is deducted on payment by default; branch can switch to send-to-kitchen".
- Truy vết tính năng → test nằm trong [feature-map](feature-map-by-release.md), không nằm trong code.

## 6. API & đồng bộ

- REST + JSON, schema zod trong `contracts`, sinh OpenAPI.
- Lệnh sync: `{command_id, type, payload, device_id, device_seq, staff_id, approval?, business_date, domain_version, created_at}`; server trả `accepted | rejected{code, message}`; áp dụng lại cùng `command_id` = không làm gì.
- Không bao giờ tin tiền client gửi: server tính lại bằng `domain` và so.

## 7. Git

- Nhánh: `feat/<slug>`, `bugfix/<slug>`, `chore/<slug>` (theo luật đặt tên của workspace; ticket nếu có).
- Commit conventional, tiếng Anh, ≤ 72 ký tự, mỗi commit một việc; commit **kèm test** của chính thay đổi đó.
- Không commit file tạm, secret, `.env`.
