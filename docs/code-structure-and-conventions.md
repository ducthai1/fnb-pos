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

Trạng thái thực tế (2026-10-20, sau đợt 1):
- `packages/domain/src/`: `money/` (Vnd, Quantity, BasisPoints, divideRounded), `time/` (localClockParts, businessDate), `order/` (types, line tree, state machine), `catalog/` (product/modifier/combo types, validateModifierGroupConfig, validateModifierSelection, resolveCombo), `pricing/` (PriceListItem, validatePriceListItem, resolveUnitPrice), `rounding/` (cash rounding). `pricing` import `catalog`; `catalog` không import `pricing`.
- `packages/db/`: `migrations/0001_tenancy.sql`, `0002_tenancy_row_level_security.sql` (SQL là nguồn thật); `src/migrations` (runner), `src/ids` (newId UUIDv7), `src/schema` (bảng Drizzle mô tả cột), `src/tenancy` (withTenant, drizzleFor), `src/test-support` (Postgres nhúng, tạo role), `DatabaseError` + `db-error-codes.ts`.
- `apps/api/`: `src/build-app.ts` (Fastify + `/health`), `test/integration/{infra,tenancy,health,support}`.
- `spikes/local-db-sync/`: spike đồng bộ (ngoài workspace, lockfile riêng) — tham khảo khi làm `packages/sync-client`, không import vào code sản phẩm.
- Sau đợt 2: `domain/src/totals/` (computeOrderTotals, buildOrderDiscountLines, allocateAmount), `domain/src/order/` thêm void-order-line, build-refund-order, order-line-reversal-*; `domain/src/permissions/` (catalog, authorize, canApprove, role templates); `domain/src/domain-version-policy.ts`; `packages/feature-flags/` (catalog, validateFlags, resolveConfig); `packages/db/migrations/0003…0006` (accounts+sessions ở schema `fnb_auth`, devices+staff+roles, audit+approval chỉ-thêm, configuration); `apps/api/src/{auth,devices,staff}/` + `clock.ts` (đồng hồ inject được); `apps/api` có cả unit test (`src/**/*.test.ts`) lẫn tích hợp.
- Sau đợt 4: `packages/contracts/src/{primitives,catalog,sync}` (moneySchema/quantitySchema/rateSchema/uuidSchema/businessDateSchema, schema menu, `syncCommandEnvelopeSchema`/`syncCommandResultSchema`/`syncChangesPageSchema`); `domain/src/order/order-line-reversal-mirror.ts`, `domain/src/totals/{validate-refund-against-sale,cumulative-discount-rate,build-line-discount}.ts`; `apps/api/src/http/uuid-schema.ts`; `apps/api/src/sync/` (apply-sync-command, change-feed, command-ledger, save-draft-command, price-draft-lines, pay-order-command, order-snapshot…), `routes/sync/`; migrations 0010 (quyền hàm fnb_auth, khóa leo thang), 0011 (đơn hàng), 0012 (đồng bộ). Test support đồng bộ: `support/sync-shop.ts`, `support/sync-commands.ts`.
- Sau đợt 5: `packages/sync-client/` (LocalStore + `@fnb/sync-client/node-sqlite`, createSyncClient, HTTP transport, kịch bản `test/scenarios/` chạy API thật qua `@fnb/api/build-app` + `@fnb/api/test-support/sync-shop`); `packages/printing/src/{bytes,escpos,text,tspl,layout,render,label,templates}`; `domain/src/{shift,kitchen}/`; `apps/api/src/sync/`: đăng ký lệnh bằng `defineSyncCommand` + `SYNC_COMMANDS` (mỗi lệnh một file, payload ở `packages/contracts/src/sync/commands/`), lệnh shift.* qua `shift-commands.ts`; migrations 0013 (order commands: sent_quantity, approval_use…), 0014 (ca & két).
- Mã lỗi API: tiền tố `API_`, khai theo miền (`auth-error-codes.ts`…); body lỗi chỉ `{code}`; 4xx validation ⇒ `API_INVALID_REQUEST`, còn lại ⇒ `API_INTERNAL` không kèm message.
- Ghép giá một món: `resolveUnitPrice(...).unitPrice` + Σ `validateModifierSelection(...).priceDelta`; combo: + `resolveCombo(...).totalUpcharge`; món cân: `multiplyVndByQuantity(unitPrice, weight, mode)`.

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
