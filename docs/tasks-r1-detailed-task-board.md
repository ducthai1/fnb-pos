# Bảng task chi tiết — tới R1

> Nguồn việc duy nhất của các phiên. Quy trình dùng: [development-workflow](development-workflow-for-claude-sessions.md).
> Trạng thái: `todo` · `doing (ngày)` · `done (ngày, commit)` · `blocked (lý do)` · `user` (việc của user, Claude chỉ nhắc/hỗ trợ).
> Mã task chỉ dùng trong tài liệu, **không** ghi vào code/test/commit.

## Bàn giao phiên trước

- 2026-10-20 — T00-06 xong: khung monorepo (pnpm 10 + Turborepo + TS 5.9 + Vitest 3 + ESLint 9), `packages/domain` với luật eslint cấm `Date.now`/`Math.random`/`fetch`, CI GitHub Actions chạy `pnpm verify`. Đã thử làm hỏng: test đỏ khi sai, lint đỏ khi domain gọi `Date.now()`.
- Máy dev: pnpm qua `corepack enable pnpm` (shim nằm trong thư mục bin của nvm). Chưa có Rust và Android SDK — cần cho T00-08.
- Tiếp theo: **T00-07** (spike DB cục bộ + đồng bộ) — không cần gì từ user.
- Đang chờ user: hồ sơ quán thí điểm (T00-01), tài khoản dùng thử (T00-02/03), kế toán (T00-05), sandbox SePay/PayOS + nhà cung cấp hóa đơn (T00-09/10).

---

## Phase 00 — Chốt yêu cầu & kiểm chứng ([phase](phase-00-chot-yeu-cau-va-kiem-chung-ky-thuat.md))

### T00-01 Hồ sơ quán thí điểm — `user`
- **Cần biết:** tên/loại quán; số quầy, số bàn, số khu; giờ mở/đóng (có qua nửa đêm?); số nhân viên + vai trò; nhân viên có order tại bàn không, bằng gì (⇒ kéo FT-105 vào R1?); thiết bị đang có (máy tính, tablet, máy POS, máy in bill/tem: hãng, model, LAN/USB/Bluetooth, két); phần mềm đang dùng; nhà cung cấp hóa đơn điện tử đang dùng; ngân hàng nhận chuyển khoản; có bán qua GrabFood/ShopeeFood không; menu hiện tại (ảnh/Excel).
- **Xong khi:** điền đủ vào `research/pilot-cafe-profile.md`.

### T00-02 Dùng thử KiotViet FnB — `user` đăng ký → Claude làm
- **Làm:** Claude điều khiển Chrome đi qua: món + topping + combo, bàn, gửi bếp, chuyển/gộp/tách bàn, hủy món, thanh toán nhiều phương thức, ca, kiểm kê, định lượng, khuyến mãi, phân quyền, báo cáo.
- **Xong khi:** `research/research-g-dung-thu-kiotviet-fnb.md` có từng flow theo mẫu của file A; mục "khác với catalog" ghi rõ.

### T00-03 Dùng thử CukCuk — `user` đăng ký → Claude làm
- Như T00-02, file `research/research-h-dung-thu-cukcuk.md`.

### T00-04 Phỏng vấn quán thí điểm — `user` (Claude soạn kịch bản)
- **Hỏi:** một ngày làm việc; giờ cao điểm; 10 thao tác dùng nhiều nhất; lỗi hay gặp ở phần mềm cũ; câu 7–11 [catalog §23](logic-catalog-flows-rules-and-design-decisions.md).
- **Xong khi:** câu trả lời ghi vào `research/pilot-cafe-profile.md`; decision-log cập nhật D-011, D-012.

### T00-05 Hỏi kế toán thuế — `user`
- **Hỏi:** câu 12–15 catalog §23 + "mã hóa đơn từ máy tính tiền có sinh được trên máy khi offline không".
- **Xong khi:** trả lời ghi vào catalog §18 kèm tên người trả lời + ngày.

### T00-06 Tạo repo + khung monorepo — Claude
- **Làm:** `git init` ở nơi user chốt; pnpm workspace + Turborepo; `apps/` `packages/` rỗng theo [bản đồ code](code-structure-and-conventions.md); `tsconfig.base.json`, eslint, prettier, vitest workspace; CI chạy `pnpm verify`; đăng ký repo vào `repos/registry.json` + `sources/<key>.md`.
- **Test:** `packages/domain/src/smoke.test.ts` (một test giả để chứng minh pipeline đỏ được khi sai).
- **Xong khi:** CI xanh trên commit đầu; cố tình làm hỏng test thì CI đỏ.
- **Phụ thuộc:** user chốt path + remote.
- **Trạng thái:** done (2026-10-20) — local verify xanh, hỏng có chủ đích thì đỏ; CI GitHub chạy khi push lần đầu. Đã đăng ký `fnb-pos` vào `repos/registry.json` + `sources/fnb-pos.md` của kho kiến thức.

### T00-07 Spike S2: DB cục bộ + đồng bộ — Claude
- **Làm:** `spikes/local-db-sync/`: interface repository chung cho SQLite (Node để test, Tauri, Capacitor) + SQLite WASM/OPFS (trình duyệt); outbox lệnh + server giả (Fastify + Postgres) áp idempotent; kéo theo cursor.
- **Test:** 2.000 đơn offline; rút/cắm mạng 20 lần; gửi trùng; đến sai thứ tự; chạy tiếp trên dữ liệu lần trước.
- **Xong khi:** báo cáo số đo: không mất/trùng đơn; thời gian ghi 1 đơn; dung lượng; kết quả trên Safari iOS (nếu có máy) ⇒ khóa D-008.
- **Phụ thuộc:** T00-06.

### T00-08 Spike S1: in ấn — Claude + `user` cắm máy in
- **Làm:** `spikes/printing/`: mã hóa ESC/POS (tiếng Việt có dấu: thử code page và chế độ ảnh raster) + TSPL (tem); gửi qua TCP 9100 từ Tauri và Capacitor; Bluetooth trên Android; Sunmi nếu có; mở két.
- **Xong khi:** in đúng trên ≥ 2 máy in thật của quán; đo thời gian bấm → ra giấy; ghi model nào chạy được.
- **Phụ thuộc:** T00-01 (biết model), T00-06.

### T00-09 Spike S3: VietQR + webhook — Claude, `user` mở sandbox SePay hoặc PayOS
- **Làm:** sinh payload EMVCo + CRC; nhận webhook sandbox; khớp theo mã nội dung; ca thiếu/thừa/sai/trùng.
- **Xong khi:** chọn được cổng (SePay/PayOS) + biết cách kiểm chữ ký.

### T00-10 Spike S4: hóa đơn điện tử — Claude, `user` mở sandbox nhà cung cấp
- **Xong khi:** biết chắc luồng phát hành, mã, gửi cuối ngày, hoàn tiền, hành vi khi offline của nhà cung cấp đã chọn.

### T00-11 Chốt phạm vi R1 — Claude + `user`
- **Làm:** cập nhật catalog, kiến trúc, decision-log, feature-map theo T00-01…10; khóa các [SPIKE].
- **Xong khi:** user duyệt phạm vi R1 cuối cùng.

---

## Phase 01 — Nền móng ([phase](phase-01-nen-mong-tenant-xac-thuc-quyen-thiet-bi.md))

### T01-01 Tooling monorepo
- **Làm:** turbo pipeline `verify/test:unit/test:api/test:sync/e2e/build`; eslint 0 warning; path alias; script `pnpm verify`.
- **Xong khi:** mọi lệnh gate chạy được (kể cả khi chưa có test) và trả exit code đúng.

### T01-02 Postgres + migration + helper test
- **Làm:** docker compose Postgres 16; drizzle-kit; helper tạo DB test riêng mỗi lần chạy, dọn sau.
- **Test:** `apps/api/test/integration/infra/migrations-apply-cleanly.test.ts`.

### T01-03 Tenancy + RLS
- **Làm:** `organization, brand, branch, area, table(khung), device, user`; RLS mọi bảng; `SET app.tenant_id` mỗi request.
- **Test:** `apps/api/test/integration/tenancy/rls-blocks-cross-tenant-reads.test.ts` — tenant A không đọc/ghi được của B (đọc, sửa, xóa, liệt kê); tắt RLS thì test đỏ.

### T01-04 Đăng nhập backoffice
- **Làm:** SĐT/email + mật khẩu; OTP (nhà cung cấp SMS/email để sau, giao diện adapter); phiên; quên mật khẩu.
- **Test:** `apps/api/test/integration/auth/backoffice-login.test.ts` — sai mật khẩu, khóa sau N lần, phiên hết hạn.

### T01-05 Ghép / thu hồi thiết bị
- **Làm:** mã ghép một lần (hạn 10 phút) → token thiết bị; thu hồi.
- **Test:** `apps/api/test/integration/devices/{pairing-code-single-use,revoked-device-is-rejected}.test.ts`.

### T01-06 PIN nhân viên
- **Làm:** PIN trên thiết bị đã ghép; giới hạn thử + khóa tạm; bản băm có salt cho offline lưu ở kho bảo mật của vỏ.
- **Test:** `apps/api/test/integration/auth/staff-pin-lockout.test.ts`.

### T01-07 Khóa quyền + vai trò mẫu + `authorize()`
- **Làm:** danh mục khóa quyền catalog §16; ngưỡng (vd giảm > X%); vai trò mẫu; `authorize(action, ctx) → allowed | needs_approval | denied` (thuần, trong domain).
- **Test:** `packages/domain/src/permissions/authorize.test.ts` — mỗi khóa quyền: có quyền / không quyền / vượt ngưỡng.

### T01-08 Duyệt tại chỗ + nhật ký
- **Làm:** lệnh mang `approval{approver_staff_id, pin_proof}`; `approval_log`; `audit_log` chỉ thêm, không sửa.
- **Test:** `apps/api/test/integration/auth/manager-approval-is-logged.test.ts` — duyệt sai PIN bị từ chối; duyệt đúng ghi đủ người yêu cầu/người duyệt.

### T01-09 Cấu hình kế thừa + công tắc
- **Làm:** `config_value(scope, key, value)`, resolve hệ thống → thương hiệu → chi nhánh → thiết bị; `packages/feature-flags` khai `requires/excludes`.
- **Test:** `packages/feature-flags/src/{validate-flag-constraints,resolve-inherited-config}.test.ts`.

### T01-10 Backoffice khung
- **Làm:** Next.js: đăng nhập, chi nhánh, nhân viên, vai trò, thiết bị (ghép/thu hồi), cấu hình.
- **Test:** `e2e/backoffice/pair-a-device.spec.ts`.

---

## Phase 02 — Lõi nghiệp vụ ([phase](phase-02-loi-nghiep-vu-dung-chung-gia-thue-don.md))

> Mọi task ở đây: test viết **trước**, nằm cạnh file nguồn trong `packages/domain/src/<miền>/`.

### T02-01 Kiểu tiền / số lượng / tỉ lệ
- **Test:** `money/money.test.ts` — cộng/nhân/chia làm tròn rõ ràng; từ chối float; định dạng `45.000 ₫`.
- **Trạng thái:** done (2026-10-20) — `money/{money,quantity,rate,divide-rounded}.ts` + 54 test (gồm property test); đổi `>=` thành `>` trong half-up làm 6 test đỏ.

### T02-02 `resolvePrice`
- **Luật:** ưu tiên variant > product > category > global; lọc chi nhánh, kênh, ngày, giờ, thứ; giá nhập tay; theo cân (đơn giá × số lượng 3 lẻ).
- **Test:** `pricing/resolve-price.test.ts` — mỗi tầng ưu tiên; happy hour bật đúng phút; ngoài khung giờ thì về giá thường.

### T02-03 `validateModifierSelection`
- **Luật:** min/max/bắt buộc; điều kiện theo biến thể; chọn trùng; max theo tùy chọn.
- **Test:** `catalog/validate-modifier-selection.test.ts` — mỗi luật một ca qua + một ca bị chặn với mã lỗi.

### T02-04 `resolveCombo`
- **Test:** `catalog/resolve-combo.test.ts` — đổi món có phụ thu; thiếu slot bắt buộc bị chặn.

### T02-05 Cây dòng đơn + `computeOrderTotals`
- **Luật:** dòng `item | modifier | combo_component | discount`; VAT + phí dịch vụ theo kênh; phí trước/sau khuyến mãi; giá gồm/cộng thuế.
- **Test:** `totals/compute-order-totals.test.ts` — bảng ví dụ thật của quán (sau T00-05).

### T02-06 Làm tròn
- **Test:** `totals/rounding.test.ts` — chỉ tiền mặt vs toàn đơn; từng phương pháp.

### T02-07 Giảm toàn đơn + phân bổ
- **Luật:** tách một dòng âm mỗi thuế suất; phân bổ theo tỉ lệ, dư đồng lẻ dồn dòng lớn nhất.
- **Test:** `totals/allocate-discount.test.ts`, `totals/order-totals.property.test.ts` (Σ dòng = tổng; Σ phân bổ = tổng giảm; không phụ thuộc thứ tự thêm món).

### T02-08 Máy trạng thái đơn + mã lỗi
- **Test:** `order/order-state-machine.test.ts` — mọi chuyển hợp lệ; mọi chuyển cấm trả đúng mã (`DOMAIN_ORDER_ALREADY_PAID`…).

### T02-09 `voidLine` + `buildRefund`
- **Luật:** chưa gửi ⇒ sửa; đã gửi ⇒ dòng âm có lý do; đã trả ⇒ đơn hoàn dòng âm, số lượng còn hoàn tính cả đơn hoàn chưa trả, cờ `restock`.
- **Test:** `order/void-line.test.ts`, `order/build-refund.test.ts` — hoàn 2 lần không vượt gốc.

### T02-10 `businessDate`
- **Test:** `time/business-date.test.ts` — 03:59 thuộc hôm trước với giờ cắt 4h; đổi giờ cắt theo chi nhánh; múi giờ.

### T02-11 Bộ property test + `domain_version`
- **Xong khi:** 10.000 đơn ngẫu nhiên: tổng tính 2 lần (mô phỏng client/server) trùng từng đồng; độ phủ domain ≥ 95%.

---

## Phase 03 — Menu & cấu hình ([phase](phase-03-menu-cau-hinh-quan-va-mau-loai-quan.md))

### T03-01 Schema catalog + migration
- **Test:** `apps/api/test/integration/catalog/catalog-schema-constraints.test.ts` — không xóa cứng món đã bán.

### T03-02 API catalog
- **Làm:** CRUD; kiểm bằng `validateModifierSelection`; đẩy `change_seq`.
- **Test:** `apps/api/test/integration/catalog/catalog-crud.test.ts` — cấu hình sai (min > max) bị chặn kèm lý do.

### T03-03 UI danh mục / món / biến thể
### T03-04 UI nhóm tùy chọn + điều kiện + xem trước lựa chọn của khách
### T03-05 UI combo
- **Test chung T03-03…05:** `e2e/backoffice/build-milk-tea-menu.spec.ts` — dựng 1 món trà sữa đủ size/đường/đá/topping, xem trước, lưu, mở lại đúng.

### T03-06 Bảng giá
- **Test:** `e2e/backoffice/happy-hour-price-list.spec.ts`.

### T03-07 Trạm pha chế/bếp + gán món
### T03-08 Hết món bật tay
- **Test:** `apps/api/test/integration/catalog/manual-86-hides-item-on-pos.test.ts`.

### T03-09 Ảnh món
- **Test:** `apps/api/test/integration/catalog/image-upload-validates-type-and-size.test.ts`.

### T03-10 Mẫu loại quán
- **Test:** `packages/shop-templates/src/apply-template-is-idempotent.test.ts` — chạy 2 lần không nhân đôi.

### T03-11 Nhập/xuất Excel
- **Test:** `apps/api/test/integration/catalog/menu-excel-roundtrip.test.ts`.

### T03-12 Dữ liệu xấu ở backoffice
- **Test:** `e2e/backoffice/hostile-menu-data.spec.ts` — 360px/800px, không tràn ở phần tử đang cuộn.

---

## Phase 04 — Bán tại quầy ([phase](phase-04-ban-tai-quay-offline-dong-bo-in-an-ca-ket.md))

### T04-01 Schema đơn / thanh toán / ca / in / hủy (server + SQLite)
- **Test:** `apps/api/test/integration/order/paid-order-is-immutable.test.ts`.

### T04-02 Sync: kéo bản chụp + thay đổi theo cursor
- **Test:** `packages/sync-client/test/scenarios/pull-resumes-from-cursor.test.ts`.

### T04-03 Sync: outbox lệnh + endpoint server
- **Test:** `packages/sync-client/test/scenarios/{duplicate-command-is-noop,out-of-order-commands,domain-version-mismatch-is-rejected,server-recomputes-totals}.test.ts`.

### T04-04 Màn "cần xử lý"
- **Test:** `apps/pos/src/features/sync/rejected-commands-panel.test.tsx`.

### T04-05 POS: ghép máy, đăng nhập PIN, đổi người
- **Test:** `e2e/pos/pair-and-pin-login.spec.ts`.

### T04-06 Màn bán
- **Làm:** lưới món, tìm nhanh, chọn biến thể/tùy chọn, ghi chú, số lượng, giữ đơn, nhiều đơn song song.
- **Test:** `apps/pos/src/features/order/modifier-picker.test.tsx`; `e2e/pos/counter-sale-cash.spec.ts`.

### T04-07 Tổng tiền + giảm tay + giá nhập tay + theo cân
- **Test:** `e2e/pos/manual-discount-over-threshold-needs-approval.spec.ts`.

### T04-08 Thanh toán
- **Làm:** tiền mặt (gợi ý mệnh giá, tiền thừa), QR động (xác nhận tay), thẻ (ghi nhận tay), nhiều phương thức.
- **Test:** `e2e/pos/split-tender-cash-and-qr.spec.ts`.

### T04-09 Số đơn 3 lớp + số gọi món
- **Test:** `packages/domain/src/order/order-numbering.test.ts`; `packages/sync-client/test/scenarios/offline-orders-get-unique-numbers.test.ts`.

### T04-10 Phiếu pha chế theo trạm
- **Làm:** domain `diffKitchenTicket(order, sent)` → dòng mới/sửa ghi chú/hủy theo trạm; bảng `kitchen_ticket(_line)`.
- **Test:** `packages/domain/src/kitchen/kitchen-ticket-diff.test.ts` — gửi lượt 2 chỉ in món mới; hủy in phiếu hủy đúng trạm.

### T04-11 `packages/printing`
- **Làm:** mẫu bill, tem ly (1 tem/ly, có topping), phiếu pha chế, chốt ca → ESC/POS + TSPL; xem trước dạng chữ.
- **Test:** `packages/printing/src/templates/*.test.ts` so với `__golden__/`.

### T04-12 Vỏ Tauri (Windows)
### T04-13 Vỏ Capacitor (Android/iOS)
- **Test chung:** `e2e/hardware-checklist.md` — chạy tay trên máy in của quán, ghi kết quả + ngày.

### T04-14 Backoffice: máy in + gán trạm → máy in
- **Test:** `e2e/backoffice/assign-station-printer.spec.ts`.

### T04-15 Hàng đợi in + in lại + báo lỗi
- **Test:** `apps/pos/src/features/printing/print-queue-retries-and-surfaces-failures.test.ts` — máy in tắt: job `failed`, hiện cảnh báo, bật lại in được, không mất phiếu.

### T04-16 Ca & két
- **Test:** `packages/domain/src/shift/expected-cash.test.ts`; `apps/api/test/integration/shift/{close-with-difference-needs-approval,open-orders-carry-to-next-shift,late-offline-order-keeps-its-shift}.test.ts`.

### T04-17 Hủy dòng / void có duyệt / đơn hoàn (UI + API)
- **Test:** `e2e/pos/void-after-sent-needs-approval.spec.ts`; `apps/api/test/integration/order/refund-cannot-exceed-original.test.ts`.

### T04-18 Offline mode + kiểm thử
- **Làm:** phát hiện mất mạng; khóa thao tác (catalog §20); badge "chưa đồng bộ N".
- **Test:** `packages/sync-client/test/scenarios/{offline-sale-then-sync,continue-on-previous-state}.test.ts`; `e2e/pos/offline-counter-sale.spec.ts`; `e2e/pos/hostile-order-data.spec.ts`.

---

## Phase 04b — Bàn cơ bản ([phase](phase-04b-ban-co-ban-cho-cafe-quay-va-ban.md))

### T4B-01 Schema + backoffice sơ đồ bàn
- **Test:** `e2e/backoffice/edit-floor-plan.spec.ts`.
### T4B-02 POS: màn sơ đồ bàn (trạng thái, thời gian ngồi)
### T4B-03 Mở bàn, nhiều lượt, gửi pha chế
### T4B-04 Tạm tính, in lại
### T4B-05 Trả sau tại bàn, đóng bàn
- **Test chung T4B-02…05:** `e2e/pos/table-two-rounds-pay-later.spec.ts` — lượt 2 chỉ in món mới; tạm tính = thanh toán.
### T4B-06 Chuyển sang bàn trống
- **Test:** `packages/domain/src/table/transfer-to-empty-table.test.ts` — chuyển sang bàn có khách bị chặn (gộp để R2).
### T4B-07 Đơn quầy kèm số bàn
- **Test:** `e2e/pos/counter-order-with-table-tag.spec.ts`.
### T4B-08 Một đơn mở/bàn + khóa phiên bản + báo xung đột
- **Test:** `packages/sync-client/test/scenarios/two-devices-edit-same-table.test.ts` — máy lưu sau bị báo, không đè.
### T4B-09 Offline với bàn
- **Luật:** máy mở bàn khi offline giữ bàn đó; máy khác chỉ xem tới khi đồng bộ.
- **Test:** `packages/sync-client/test/scenarios/table-opened-offline-is-owned-by-device.test.ts`.

---

## Phase 05 — QR, hóa đơn, chốt ngày ⇒ R1 ([phase](phase-05-thanh-toan-qr-hoa-don-dien-tu-chot-ngay-bao-cao.md))

### T05-01 `payment_intent` + payload VietQR
- **Test:** `packages/domain/src/payment/vietqr-payload-crc.test.ts` — so với QR mẫu của ngân hàng.
### T05-02 Webhook + chữ ký + `bank_transaction` unique
- **Test:** `apps/api/test/integration/payments/webhook-is-idempotent.test.ts` — gửi 10 lần = 1 thanh toán; chữ ký sai bị chặn.
### T05-03 Khớp tự động + đẩy realtime
### T05-04 Màn khớp tay
- **Test chung:** `apps/api/test/integration/payments/match-under-over-duplicate.test.ts`.
### T05-05 Hồ sơ HĐĐT theo chi nhánh
### T05-06 Adapter nhà cung cấp HĐĐT
- **Test:** `apps/api/test/integration/einvoice/provider-adapter-contract.test.ts` (fake ghi lại lời gọi + sandbox thật chạy tay).
### T05-07 Phát hành mỗi thanh toán + hàng đợi + mã tra cứu trên bill
- **Test:** `apps/api/test/integration/einvoice/{one-invoice-per-payment,queued-while-offline}.test.ts`.
### T05-08 Thông tin người mua
- **Test:** `e2e/pos/invoice-with-buyer-tax-code.spec.ts`.
### T05-09 Gửi cuối ngày + cảnh báo
- **Test:** `apps/api/test/integration/einvoice/daily-batch-submission.test.ts`.
### T05-10 Hoàn tiền sau khi có hóa đơn (theo T00-05)
### T05-11 Chốt ngày kinh doanh
- **Test:** `apps/api/test/integration/day-close/end-of-day-close.test.ts` — còn ca mở thì không chốt.
### T05-12 Báo cáo cơ bản
- **Test:** `apps/api/test/integration/reports/revenue-definitions.test.ts` — gộp/giảm/thuần/thuế/hoàn khớp bảng tay.
### T05-13 Chạy song song 3–5 ngày + go-live R1 — Claude + `user`
- **Xong khi:** số từng ngày khớp phần mềm cũ; checklist go-live ký.

---

## Phase 11 (phần vận hành, xong trước R1) ([phase](phase-11-saas-thuong-mai-dang-ky-goi-cuoc-van-hanh.md))

### T11-01 Giám sát lỗi client + server (có tenant_id, không log dữ liệu cá nhân)
### T11-02 Backup tự động + diễn tập khôi phục — ghi `infra/restore-drill.md`
### T11-03 Staging + dữ liệu giả (gồm bộ dữ liệu xấu)
### T11-04 Cập nhật app quầy: nóng, chặn giữa ca, quay lui
### T11-05 Pipeline deploy (staging tự động, production bấm tay)

---

## Backlog phát sinh

(Việc mới nảy ra trong lúc làm — ghi: ngày, mô tả, vì sao, gợi ý phase.)
