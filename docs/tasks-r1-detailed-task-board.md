# Bảng task chi tiết — tới R1

> Nguồn việc duy nhất của các phiên. Quy trình dùng: [development-workflow](development-workflow-for-claude-sessions.md).
> Trạng thái: `todo` · `doing (ngày)` · `done (ngày, commit)` · `blocked (lý do)` · `user` (việc của user, Claude chỉ nhắc/hỗ trợ).
> Mã task chỉ dùng trong tài liệu, **không** ghi vào code/test/commit.

## Bàn giao phiên trước

- 2026-10-20 11:55 — Đợt 7 cặp 2 (2 agent, 1,06M token, 74 phút) đã merge + push (`a601e37`): **backoffice web** (`apps/backoffice`, Next.js 15.5.28: đăng nhập + chọn tổ chức, chọn chi nhánh, thiết bị + mã ghép + thu hồi, nhân viên + PIN, vai trò + ngưỡng, danh mục, trình sửa món với xem trước lựa chọn của khách bằng domain, hết món) + e2e dựng menu trà sữa / ghép thiết bị / dữ liệu xấu; **hóa đơn điện tử** (hồ sơ theo chi nhánh, interface nhà cung cấp + bản giả, 1 hóa đơn mỗi lần thanh toán qua hàng đợi SKIP LOCKED + backoff, thông tin người mua, gửi cuối ngày), **chốt ngày** (chặn khi còn ca mở / hóa đơn chưa phát), **báo cáo doanh thu ngày** theo định nghĩa cố định.
- **Lỗ hổng tích hợp:** backoffice gọi `GET /branches`, `GET /devices?branchId=`, `GET /staff` mà API CHƯA có (e2e dùng bản giả lập trong `e2e/backoffice/support/pending-backoffice-read-routes.ts`) ⇒ bản thật báo lỗi ở chọn chi nhánh/danh sách thiết bị/nhân viên. Việc đầu của đợt 8.
- Cổng: unit ~1.700 · `test:api` 1.459 · `test:sync` 14 · `test:browser`/e2e 46 — xanh.
- Tiếp: đợt 8 — cặp 8a: review sâu đợt 3–7 (chỉ đọc) + route server còn thiếu (3 route đọc, `/auth/me` kèm quyền, route ghi cấu hình, gộp chuyển đổi tài liệu món); cặp 8b: POS màn bàn + QR tự xác nhận + người mua hóa đơn; backoffice cài đặt + báo cáo + chốt ngày + khớp tay.

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
- **Trạng thái:** done (2026-10-20) — 0 mất / 0 trùng với 2.000 đơn offline + 500 đơn chạy tiếp trên dữ liệu cũ có lỗi mạng; ghi 1 đơn node:sqlite ~1,2–1,6 ms (synchronous=FULL); SQLite WASM/OPFS chạy được trong Chrome headless (opfs-sahpool chỉ 1 tab). Lộ bẫy 12 (xem Backlog). D-008 giữ, có điều chỉnh (D-021).

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
- **Trạng thái:** một phần (2026-10-20) — đã có `test:api` (turbo, cache: false) + bước CI; `test:sync`/`e2e`/`build` thêm khi có code tương ứng.

### T01-02 Postgres + migration + helper test
- **Làm:** docker compose Postgres 16; drizzle-kit; helper tạo DB test riêng mỗi lần chạy, dọn sau.
- **Test:** `apps/api/test/integration/infra/migrations-apply-cleanly.test.ts`.
- **Trạng thái:** done (2026-10-20) — migration SQL viết tay + runner (khóa advisory, checksum, 1 transaction/file), Postgres 17.10 nhúng (cổng động, thư mục tạm), role `fnb_owner` (migration) / `fnb_app` (DML). Không dùng Docker (máy không có quyền).

### T01-03 Tenancy + RLS
- **Làm:** `organization, brand, branch, area, table(khung), device, user`; RLS mọi bảng; `SET app.tenant_id` mỗi request.
- **Test:** `apps/api/test/integration/tenancy/rls-blocks-cross-tenant-reads.test.ts` — tenant A không đọc/ghi được của B (đọc, sửa, xóa, liệt kê); tắt RLS thì test đỏ.
- **Trạng thái:** done (2026-10-20) — 7 bảng tenancy, ENABLE + FORCE RLS, policy `NULLIF(current_setting('app.tenant_id', true), '')::uuid`, UNIQUE (tenant_id, id) + khóa ngoại kép (tenant_id, parent_id) vì kiểm FK bỏ qua RLS; test âm chéo tenant + test owner bị RLS ràng buộc. `withTenant` + Fastify `buildApp` + `/health`.

### T01-04 Đăng nhập backoffice
- **Làm:** SĐT/email + mật khẩu; OTP (nhà cung cấp SMS/email để sau, giao diện adapter); phiên; quên mật khẩu.
- **Test:** `apps/api/test/integration/auth/backoffice-login.test.ts` — sai mật khẩu, khóa sau N lần, phiên hết hạn.
- **Trạng thái:** done (2026-10-20) — bảng toàn cục `fnb_auth.account/account_tenant/session` (fnb_app chỉ gọi hàm SECURITY DEFINER), membership theo tenant; khóa 15 phút sau 5 lần sai, 401 giống nhau cho mọi lỗi + scrypt giả để không lộ thời gian; phiên 7 ngày tuyệt đối; account nhiều tổ chức ⇒ 409 kèm danh sách. OTP: chỉ cổng + fake. Quên mật khẩu chưa làm.

### T01-05 Ghép / thu hồi thiết bị
- **Làm:** mã ghép một lần (hạn 10 phút) → token thiết bị; thu hồi.
- **Test:** `apps/api/test/integration/devices/{pairing-code-single-use,revoked-device-is-rejected}.test.ts`.
- **Trạng thái:** done (2026-10-20) — mã ghép 8 ký tự (bảng 30 ký tự không nhầm), 10 phút, dùng một lần; token thiết bị `<tenantId>.<secret>` chỉ lưu SHA-256; thu hồi idempotent; `GET /devices/me`.

### T01-06 PIN nhân viên
- **Làm:** PIN trên thiết bị đã ghép; giới hạn thử + khóa tạm; bản băm có salt cho offline lưu ở kho bảo mật của vỏ.
- **Test:** `apps/api/test/integration/auth/staff-pin-lockout.test.ts`.
- **Trạng thái:** done phía server (2026-10-20) — PIN 4–6 số, chặn PIN dễ; sai 5 lần khóa 5 phút (429 + Retry-After); staff session 12h gắn thiết bị; sai chi nhánh 403. Xác minh PIN offline CHƯA làm (Backlog).

### T01-07 Khóa quyền + vai trò mẫu + `authorize()`
- **Làm:** danh mục khóa quyền catalog §16; ngưỡng (vd giảm > X%); vai trò mẫu; `authorize(action, ctx) → allowed | needs_approval | denied` (thuần, trong domain).
- **Test:** `packages/domain/src/permissions/authorize.test.ts` — mỗi khóa quyền: có quyền / không quyền / vượt ngưỡng.
- **Trạng thái:** done (2026-10-20) — `permissions/`: 19 khóa quyền, ngưỡng (giảm giá %, thu/chi tiền), approvable; nhiều grant ⇒ lấy rộng nhất; `canApprove` yêu cầu khóa approvable; 6 vai trò mẫu (chờ user duyệt con số).

### T01-08 Duyệt tại chỗ + nhật ký
- **Làm:** lệnh mang `approval{approver_staff_id, pin_proof}`; `approval_log`; `audit_log` chỉ thêm, không sửa.
- **Test:** `apps/api/test/integration/auth/manager-approval-is-logged.test.ts` — duyệt sai PIN bị từ chối; duyệt đúng ghi đủ người yêu cầu/người duyệt.
- **Trạng thái:** done (2026-10-20) — `approval_log`, `audit_log` chỉ-thêm (REVOKE + trigger chặn cả owner), approver ≠ requester, `recordApproval`/`appendAudit` lấy tenant từ phiên DB.

### T01-09 Cấu hình kế thừa + công tắc
- **Làm:** `config_value(scope, key, value)`, resolve hệ thống → thương hiệu → chi nhánh → thiết bị; `packages/feature-flags` khai `requires/excludes`.
- **Test:** `packages/feature-flags/src/{validate-flag-constraints,resolve-inherited-config}.test.ts`.
- **Trạng thái:** done (2026-10-20) — `packages/feature-flags` (12 công tắc, requires/excludes, scope), `resolveConfig`, bảng `config_value` có cột sinh brand/branch/device + khóa ngoại kép.

### T01-10 Backoffice khung
- **Làm:** Next.js: đăng nhập, chi nhánh, nhân viên, vai trò, thiết bị (ghép/thu hồi), cấu hình.
- **Test:** `e2e/backoffice/pair-a-device.spec.ts`.
- **Trạng thái:** done (2026-10-20) — `apps/backoffice` Next.js 15.5: đăng nhập, chọn tổ chức/chi nhánh, thiết bị, nhân viên, vai trò. **Thiếu route đọc phía API** (Backlog).

---

## Phase 02 — Lõi nghiệp vụ ([phase](phase-02-loi-nghiep-vu-dung-chung-gia-thue-don.md))

> Mọi task ở đây: test viết **trước**, nằm cạnh file nguồn trong `packages/domain/src/<miền>/`.

### T02-01 Kiểu tiền / số lượng / tỉ lệ
- **Test:** `money/money.test.ts` — cộng/nhân/chia làm tròn rõ ràng; từ chối float; định dạng `45.000 ₫`.
- **Trạng thái:** done (2026-10-20) — `money/{money,quantity,rate,divide-rounded}.ts` + 54 test (gồm property test); đổi `>=` thành `>` trong half-up làm 6 test đỏ.

### T02-02 `resolvePrice`
- **Luật:** ưu tiên variant > product > category > global; lọc chi nhánh, kênh, ngày, giờ, thứ; giá nhập tay; theo cân (đơn giá × số lượng 3 lẻ).
- **Test:** `pricing/resolve-price.test.ts` — mỗi tầng ưu tiên; happy hour bật đúng phút; ngoài khung giờ thì về giá thường.
- **Trạng thái:** done (2026-10-20) — `pricing/resolve-price.ts` + `validatePriceListItem`; ưu tiên variant > product > category > global, rồi branch > null, channel > null, priority, id. Có 3 câu hỏi chờ user (D-022).

### T02-03 `validateModifierSelection`
- **Luật:** min/max/bắt buộc; điều kiện theo biến thể; chọn trùng; max theo tùy chọn.
- **Test:** `catalog/validate-modifier-selection.test.ts` — mỗi luật một ca qua + một ca bị chặn với mã lỗi.
- **Trạng thái:** done (2026-10-20) — `catalog/validate-modifier-group-config.ts`, `validate-modifier-selection.ts`; bắt buộc ⇔ minSelect ≥ 1; fixture trà sữa trân châu.

### T02-04 `resolveCombo`
- **Test:** `catalog/resolve-combo.test.ts` — đổi món có phụ thu; thiếu slot bắt buộc bị chặn.
- **Trạng thái:** done (2026-10-20) — `catalog/resolve-combo.ts`.

### T02-05 Cây dòng đơn + `computeOrderTotals`
- **Luật:** dòng `item | modifier | combo_component | discount`; VAT + phí dịch vụ theo kênh; phí trước/sau khuyến mãi; giá gồm/cộng thuế.
- **Test:** `totals/compute-order-totals.test.ts` — bảng ví dụ thật của quán (sau T00-05).
- **Trạng thái:** done (2026-10-20) — gồm cả dòng hủy (gộp vào dòng gốc) và đơn hoàn (đối xứng / đọc `refundAmounts`).

### T02-06 Làm tròn
- **Test:** `totals/rounding.test.ts` — chỉ tiền mặt vs toàn đơn; từng phương pháp.
- **Trạng thái:** done (2026-10-20) — `rounding/cash-rounding.ts` (`roundToStep`, `cashRoundingAdjustment`).

### T02-07 Giảm toàn đơn + phân bổ
- **Luật:** tách một dòng âm mỗi thuế suất; phân bổ theo tỉ lệ, dư đồng lẻ dồn dòng lớn nhất.
- **Test:** `totals/allocate-discount.test.ts`, `totals/order-totals.property.test.ts` (Σ dòng = tổng; Σ phân bổ = tổng giảm; không phụ thuộc thứ tự thêm món).
- **Trạng thái:** done (2026-10-20) — `buildOrderDiscountLines` (một dòng mỗi thuế suất), `allocateAmount` (largest remainder).

### T02-08 Máy trạng thái đơn + mã lỗi
- **Test:** `order/order-state-machine.test.ts` — mọi chuyển hợp lệ; mọi chuyển cấm trả đúng mã (`DOMAIN_ORDER_ALREADY_PAID`…).
- **Trạng thái:** done (2026-10-20) — `order/` (types, line tree, state machine). Dòng con: quantity tính trên MỘT đơn vị dòng cha (D-020). Dòng âm (hủy/hoàn) chưa có — thêm ở T02-09.

### T02-09 `voidLine` + `buildRefund`
- **Luật:** chưa gửi ⇒ sửa; đã gửi ⇒ dòng âm có lý do; đã trả ⇒ đơn hoàn dòng âm, số lượng còn hoàn tính cả đơn hoàn chưa trả, cờ `restock`.
- **Test:** `order/void-line.test.ts`, `order/build-refund.test.ts` — hoàn 2 lần không vượt gốc.
- **Trạng thái:** done (2026-10-20) — `voidLine` + `buildRefund` (ở `totals`, cần charge profile của lúc bán) trả đúng phần giảm/thuế/phí đã trả; lần hoàn cuối nhận phần dư.

### T02-10 `businessDate`
- **Test:** `time/business-date.test.ts` — 03:59 thuộc hôm trước với giờ cắt 4h; đổi giờ cắt theo chi nhánh; múi giờ.
- **Trạng thái:** done (2026-10-20) — `time/business-date.ts`. Sau merge phát hiện property test đỏ ngẫu nhiên: `fc.date` của fast-check 4 sinh ngày không hợp lệ ⇒ đã thêm `noInvalidDate: true` (luật mới trong testing-strategy).

### T02-11 Bộ property test + `domain_version`
- **Xong khi:** 10.000 đơn ngẫu nhiên: tổng tính 2 lần (mô phỏng client/server) trùng từng đồng; độ phủ domain ≥ 95%.
- **Trạng thái:** done (2026-10-20) — `totals/order-lifecycle.property.test.ts` 10.000 vòng đời (bán → giảm → hủy → trả → hoàn nhiều lần), server dựng lại đơn hoàn từ cùng yêu cầu qua JSON round-trip cho kết quả giống hệt. Bộ unit domain giờ ~10s.

---

## Phase 03 — Menu & cấu hình ([phase](phase-03-menu-cau-hinh-quan-va-mau-loai-quan.md))

### T03-01 Schema catalog + migration
- **Test:** `apps/api/test/integration/catalog/catalog-schema-constraints.test.ts` — không xóa cứng món đã bán.
- **Trạng thái:** done (2026-10-20) — 0007_catalog.sql, 0008_price_lists.sql; fnb_app không DELETE được món/biến thể/option (chỉ archived_at); CHECK ở DB cho luật rẻ.

### T03-02 API catalog
- **Làm:** CRUD; kiểm bằng `validateModifierSelection`; đẩy `change_seq`.
- **Test:** `apps/api/test/integration/catalog/catalog-crud.test.ts` — cấu hình sai (min > max) bị chặn kèm lý do.
- **Trạng thái:** done (2026-10-20) — PUT/GET món dạng tài liệu lồng nhau, khóa lạc quan theo version (409), danh mục, trạm, hết món tay, bảng giá; lỗi domain ⇒ 400 `{code}`. **Chưa gắn `edit_menu`** (đợt 4).

### T03-03 UI danh mục / món / biến thể
- **Trạng thái:** done (2026-10-20) — danh mục + danh sách món + trình sửa món (backoffice).

### T03-04 UI nhóm tùy chọn + điều kiện + xem trước lựa chọn của khách
- **Trạng thái:** done (2026-10-20) — nhóm tùy chọn, luật theo size, xem trước lựa chọn bằng domain.

### T03-05 UI combo
- **Test chung T03-03…05:** `e2e/backoffice/build-milk-tea-menu.spec.ts` — dựng 1 món trà sữa đủ size/đường/đá/topping, xem trước, lưu, mở lại đúng.

### T03-06 Bảng giá
- **Test:** `e2e/backoffice/happy-hour-price-list.spec.ts`.

### T03-07 Trạm pha chế/bếp + gán món
### T03-08 Hết món bật tay
- **Test:** `apps/api/test/integration/catalog/manual-86-hides-item-on-pos.test.ts`.
- **Trạng thái:** done phía API (2026-10-20) — `PUT /catalog/availability`; UI chưa.

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
- **Trạng thái:** một phần (2026-10-20) — 0011_orders.sql: sales_order (charge_profile snapshot), sales_order_line, refund_line_amount, payment, line_void_record, shift (khung); trigger chặn sửa dòng của đơn không ở draft (kể cả owner). Chưa có print_job, kitchen_ticket.

### T04-02 Sync: kéo bản chụp + thay đổi theo cursor
- **Test:** `packages/sync-client/test/scenarios/pull-resumes-from-cursor.test.ts`.
- **Trạng thái:** done (2026-10-20) — `@fnb/sync-client`: kéo theo cursor (lưu cùng giao dịch, lùi ⇒ lỗi), giữ snapshot server version cao nhất, không lùi.

### T04-03 Sync: outbox lệnh + endpoint server
- **Test:** `packages/sync-client/test/scenarios/{duplicate-command-is-noop,out-of-order-commands,domain-version-mismatch-is-rejected,server-recomputes-totals}.test.ts`.
- **Trạng thái:** done (2026-10-20) — client + server; kịch bản test:sync: pull-resumes-from-cursor, duplicate, out-of-order, domain-version, server-recomputes-totals, offline-sale-then-sync (2.000 đơn), continue-on-previous-state, two-tills-at-peak-converge.

### T04-04 Màn "cần xử lý"
- **Test:** `apps/pos/src/features/sync/rejected-commands-panel.test.tsx`.
- **Trạng thái:** một phần (2026-10-20) — màn "Cần xử lý" + đếm trong app POS; chưa có thao tác xử lý từng lệnh.

### T04-05 POS: ghép máy, đăng nhập PIN, đổi người
- **Test:** `e2e/pos/pair-and-pin-login.spec.ts`.
- **Trạng thái:** done bản web (2026-10-20) — ghép máy bằng mã 8 ký tự, chọn nhân viên + PIN, token thiết bị trong IndexedDB (vỏ native phải dùng keychain); e2e `e2e/pos/pair-and-pin-login.spec.ts`. Đổi người chưa gọi logout server (chưa có endpoint).

### T04-06 Màn bán
- **Làm:** lưới món, tìm nhanh, chọn biến thể/tùy chọn, ghi chú, số lượng, giữ đơn, nhiều đơn song song.
- **Test:** `apps/pos/src/features/order/modifier-picker.test.tsx`; `e2e/pos/counter-sale-cash.spec.ts`.
- **Trạng thái:** done bản web (2026-10-20) — tab danh mục, tìm bỏ dấu, lưới món, bảng chọn tùy chọn theo luật domain, giỏ dạng cây, lưu nháp tự động. Chưa có: combo, giá mở, món cân, ảnh món, mở lại nháp sau khi tải lại.

### T04-07 Tổng tiền + giảm tay + giá nhập tay + theo cân
- **Test:** `e2e/pos/manual-discount-over-threshold-needs-approval.spec.ts`.

### T04-08 Thanh toán
- **Làm:** tiền mặt (gợi ý mệnh giá, tiền thừa), QR động (xác nhận tay), thẻ (ghi nhận tay), nhiều phương thức.
- **Test:** `e2e/pos/split-tender-cash-and-qr.spec.ts`.
- **Trạng thái:** done bản web (2026-10-20) — tiền mặt (phím nhanh, tiền thừa), QR xác nhận tay, nhiều phương thức; e2e `counter-sale-cash.spec.ts`. Chưa làm tròn tiền mặt.

### T04-09 Số đơn 3 lớp + số gọi món
- **Test:** `packages/domain/src/order/order-numbering.test.ts`; `packages/sync-client/test/scenarios/offline-orders-get-unique-numbers.test.ts`.

### T04-10 Phiếu pha chế theo trạm
- **Làm:** domain `diffKitchenTicket(order, sent)` → dòng mới/sửa ghi chú/hủy theo trạm; bảng `kitchen_ticket(_line)`.
- **Test:** `packages/domain/src/kitchen/kitchen-ticket-diff.test.ts` — gửi lượt 2 chỉ in món mới; hủy in phiếu hủy đúng trạm.
- **Trạng thái:** done phía server (2026-10-20) — `order.mark_sent_to_kitchen`, kitchen_ticket(_line) chỉ-thêm, sent_quantity/sent_note; UI POS + in thật chưa.

### T04-11 `packages/printing`
- **Làm:** mẫu bill, tem ly (1 tem/ly, có topping), phiếu pha chế, chốt ca → ESC/POS + TSPL; xem trước dạng chữ.
- **Test:** `packages/printing/src/templates/*.test.ts` so với `__golden__/`.
- **Trạng thái:** done (2026-10-20) — `@fnb/printing`: ESC/POS + TSPL + Windows-1258 + ascii-fold, QR, mẫu bill/tem ly/phiếu bếp/chốt ca, golden (`pnpm --filter @fnb/printing golden:update`). Chưa thử máy in thật (T00-08).

### T04-12 Vỏ Tauri (Windows)
### T04-13 Vỏ Capacitor (Android/iOS)
- **Test chung:** `e2e/hardware-checklist.md` — chạy tay trên máy in của quán, ghi kết quả + ngày.

### T04-14 Backoffice: máy in + gán trạm → máy in
- **Test:** `e2e/backoffice/assign-station-printer.spec.ts`.

### T04-15 Hàng đợi in + in lại + báo lỗi
- **Test:** `apps/pos/src/features/printing/print-queue-retries-and-surfaces-failures.test.ts` — máy in tắt: job `failed`, hiện cảnh báo, bật lại in được, không mất phiếu.
- **Trạng thái:** một phần (2026-10-20) — `print.job_reported`, print_job_log chỉ-thêm, `GET /reports/print-failures`; hàng đợi in phía máy chưa.

### T04-16 Ca & két
- **Test:** `packages/domain/src/shift/expected-cash.test.ts`; `apps/api/test/integration/shift/{close-with-difference-needs-approval,open-orders-carry-to-next-shift,late-offline-order-keeps-its-shift}.test.ts`.
- **Trạng thái:** done phía server (2026-10-20) — domain `shift/` (trạng thái, mệnh giá, expectedCash, cumulativeCashMovedBy) + 0014 + lệnh shift.*; UI chưa.

### T04-17 Hủy dòng / void có duyệt / đơn hoàn (UI + API)
- **Test:** `e2e/pos/void-after-sent-needs-approval.spec.ts`; `apps/api/test/integration/order/refund-cannot-exceed-original.test.ts`.
- **Trạng thái:** done phía server (2026-10-20) — `order.void_line`, `order.refund`, `order.cancel`; duyệt tại chỗ dùng một lần (`approval_use`), hạn 10 phút quanh createdAt của máy. UI chưa.

### T04-18 Offline mode + kiểm thử
- **Làm:** phát hiện mất mạng; khóa thao tác (catalog §20); badge "chưa đồng bộ N".
- **Test:** `packages/sync-client/test/scenarios/{offline-sale-then-sync,continue-on-previous-state}.test.ts`; `e2e/pos/offline-counter-sale.spec.ts`; `e2e/pos/hostile-order-data.spec.ts`.
- **Trạng thái:** một phần (2026-10-20) — e2e `offline-counter-sale.spec.ts` (chặn /api ⇒ bán + trả ⇒ mở mạng ⇒ đồng bộ đủ).

---

## Phase 04b — Bàn cơ bản ([phase](phase-04b-ban-co-ban-cho-cafe-quay-va-ban.md))

### T4B-01 Schema + backoffice sơ đồ bàn
- **Test:** `e2e/backoffice/edit-floor-plan.spec.ts`.
- **Trạng thái:** done phía API (2026-10-20) — `/floor/areas`, `/floor/tables` (x/y/w/h/shape, số ghế, archive khi đã dùng); UI backoffice chưa.

### T4B-02 POS: màn sơ đồ bàn (trạng thái, thời gian ngồi)
### T4B-03 Mở bàn, nhiều lượt, gửi pha chế
- **Trạng thái:** done phía server (2026-10-20) — `order.save_draft` nhận tableId (dine_in), đơn giữ bàn suốt đời, đổi bàn chỉ qua transfer.

### T4B-04 Tạm tính, in lại
### T4B-05 Trả sau tại bàn, đóng bàn
- **Test chung T4B-02…05:** `e2e/pos/table-two-rounds-pay-later.spec.ts` — lượt 2 chỉ in món mới; tạm tính = thanh toán.
### T4B-06 Chuyển sang bàn trống
- **Test:** `packages/domain/src/table/transfer-to-empty-table.test.ts` — chuyển sang bàn có khách bị chặn (gộp để R2).
- **Trạng thái:** done phía server (2026-10-20) — `table.transfer` sang bàn trống (quyền transfer_table).

### T4B-07 Đơn quầy kèm số bàn
- **Test:** `e2e/pos/counter-order-with-table-tag.spec.ts`.
- **Trạng thái:** done phía server (2026-10-20) — `tableTag` cho đơn quầy (không chiếm bàn).

### T4B-08 Một đơn mở/bàn + khóa phiên bản + báo xung đột
- **Test:** `packages/sync-client/test/scenarios/two-devices-edit-same-table.test.ts` — máy lưu sau bị báo, không đè.
- **Trạng thái:** done phía server (2026-10-20) — unique partial index một đơn draft mỗi bàn; 2 máy mở cùng bàn đồng thời: một được, một bị từ chối.

### T4B-09 Offline với bàn
- **Luật:** máy mở bàn khi offline giữ bàn đó; máy khác chỉ xem tới khi đồng bộ.
- **Test:** `packages/sync-client/test/scenarios/table-opened-offline-is-owned-by-device.test.ts`.

---

## Phase 05 — QR, hóa đơn, chốt ngày ⇒ R1 ([phase](phase-05-thanh-toan-qr-hoa-don-dien-tu-chot-ngay-bao-cao.md))

### T05-01 `payment_intent` + payload VietQR
- **Test:** `packages/domain/src/payment/vietqr-payload-crc.test.ts` — so với QR mẫu của ngân hàng.
- **Trạng thái:** done (2026-10-20) — `domain/payment` buildVietQrPayload/parseVietQrPayload + CRC-16/CCITT-FALSE; lệnh payment.create_intent/cancel_intent.

### T05-02 Webhook + chữ ký + `bank_transaction` unique
- **Test:** `apps/api/test/integration/payments/webhook-is-idempotent.test.ts` — gửi 10 lần = 1 thanh toán; chữ ký sai bị chặn.
- **Trạng thái:** done (2026-10-20) — `POST /webhooks/payments/:gateway/:tenantRoute`, adapter SePay + PayOS (+ fake), bank_transaction chỉ-thêm unique (gateway, reference_code). PayOS: cần đối chiếu sandbox.

### T05-03 Khớp tự động + đẩy realtime
- **Trạng thái:** done (2026-10-20) — khớp tự động theo mã nội dung FNB+8 ký tự; snapshot intent qua change_log. Màn QR tự đổi trạng thái trên POS chưa nối.

### T05-04 Màn khớp tay
- **Test chung:** `apps/api/test/integration/payments/match-under-over-duplicate.test.ts`.
- **Trạng thái:** done phía API (2026-10-20) — `GET /payments/unmatched`, `POST /payments/match`; UI backoffice chưa.

### T05-05 Hồ sơ HĐĐT theo chi nhánh
- **Trạng thái:** done (2026-10-20) — hồ sơ HĐĐT theo chi nhánh qua config (regime `nd254-tt91`, ký hiệu có M).

### T05-06 Adapter nhà cung cấp HĐĐT
- **Test:** `apps/api/test/integration/einvoice/provider-adapter-contract.test.ts` (fake ghi lại lời gọi + sandbox thật chạy tay).
- **Trạng thái:** một phần (2026-10-20) — interface EInvoiceProvider + FakeEInvoiceProvider; adapter thật chờ sandbox nhà cung cấp.

### T05-07 Phát hành mỗi thanh toán + hàng đợi + mã tra cứu trên bill
- **Test:** `apps/api/test/integration/einvoice/{one-invoice-per-payment,queued-while-offline}.test.ts`.
- **Trạng thái:** done phía server (2026-10-20) — 1 hóa đơn mỗi lần thanh toán, hàng đợi SKIP LOCKED + lease, backoff 30s→1h, tối đa 20 lần; snapshot đơn mang mã tra cứu. UI POS chưa.

### T05-08 Thông tin người mua
- **Test:** `e2e/pos/invoice-with-buyer-tax-code.spec.ts`.
- **Trạng thái:** done phía server (2026-10-20) — `order.set_buyer_info`; UI POS chưa.

### T05-09 Gửi cuối ngày + cảnh báo
- **Test:** `apps/api/test/integration/einvoice/daily-batch-submission.test.ts`.
- **Trạng thái:** done (2026-10-20) — einvoice_daily_batch gửi theo ngày kinh doanh.

### T05-10 Hoàn tiền sau khi có hóa đơn (theo T00-05)
### T05-11 Chốt ngày kinh doanh
- **Test:** `apps/api/test/integration/day-close/end-of-day-close.test.ts` — còn ca mở thì không chốt.
- **Trạng thái:** done phía API (2026-10-20) — `POST /branches/:id/day-close` (view_reports + accept_close_difference).

### T05-12 Báo cáo cơ bản
- **Test:** `apps/api/test/integration/reports/revenue-definitions.test.ts` — gộp/giảm/thuần/thuế/hoàn khớp bảng tay.
- **Trạng thái:** done phía API (2026-10-20) — `GET /reports/daily-sales` (gộp/giảm/thuần/thuế theo thuế suất/phí dịch vụ/hoàn/phương thức/giờ/món); UI chưa.

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

- 2026-10-20 · **[gấp, trước R1]** Bẫy 12 của spike S2: kết quả `accepted` phải mang ảnh chụp đơn sau khi áp để máy vẫn kéo được khi còn lệnh chờ; cần test hội tụ 2 máy giờ cao điểm (tỉ lệ từ chối ≈ 0). → T04-02/03.
- 2026-10-20 · Mang các "ratchet test" của spike sang `packages/sync-client` + `apps/api`: không bỏ sót thay đổi khi commit muộn (advisory lock), phân trang qua change_seq 2 chữ số, giao trùng đồng thời, lô đảo thứ tự ⇒ retry, chạy lần 2 trên dữ liệu cũ, trạng thái máy = server (hash), tổng ngày = tổng dòng. → T04-02/03.
- 2026-10-20 · Kiểm cấu hình nhóm tùy chọn không thể thỏa (min > số option khi không cho trùng, hoặc Σ maxQuantity < min). → T03-02.
- 2026-10-20 · `validateComboConfig` (slot min/max, option trùng, product id không tồn tại). → T03-02.
- 2026-10-20 · Kiểm tham chiếu cấp món: khóa `variantRules` và item bảng giá theo variant phải trỏ đúng variant của món; id item bảng giá không trùng. → T03-02.
- 2026-10-20 · Script/runbook tạo role `fnb_owner`/`fnb_app` + default privileges cho môi trường thật (hiện chỉ có trong test support). → T11-05.
- 2026-10-20 · `newId()` đang ở `@fnb/db`; POS offline cần cùng bộ sinh từ gói không phụ thuộc server ⇒ tách gói `ids` nhỏ khi bắt đầu POS. → T04-01.
- 2026-10-20 · Đăng ký tổ chức mới chạy bằng role app hay đường riêng — quyết ở T01-04.
- 2026-10-20 · **[gấp]** `computeOrderTotals` × dòng âm: gộp dòng hủy vào dòng nó đảo (cùng đơn), đơn hoàn (toàn dòng âm) tính đối xứng; test: hủy 1/2 ly = tổng của đơn 1 ly; hoàn toàn bộ = đúng số âm của đơn gốc. → đợt 3.
- 2026-10-20 · Hoàn một phần đơn có giảm giá toàn đơn/khuyến mãi: dòng hoàn phải mang phần giảm đã phân bổ (dùng `allocateAmount`) để không trả lại nhiều hơn khách đã trả. → đợt 3.
- 2026-10-20 · Gắn khóa quyền vào API backoffice (tạo mã ghép, tạo nhân viên, thu hồi thiết bị đang mở cho mọi member); kiểm `role.permission_keys` khớp danh mục; seed 6 vai trò mẫu khi tạo tổ chức. → đợt 3.
- 2026-10-20 · Môi trường thật cần default privileges cho FUNCTION (REVOKE EXECUTE FROM PUBLIC, GRANT cho role app) trước khi chạy migration — bổ sung vào runbook role. → T11-05.
- 2026-10-20 · Giới hạn tần suất `/auth/login`, `/devices/pair` (theo IP/thiết bị) — API hay proxy? → T11.
- 2026-10-20 · Job dọn mã ghép, route mã ghép, phiên hết hạn. → T11.
- 2026-10-20 · Xác minh PIN khi offline: gửi băm PIN 4–6 số xuống máy là brute-force được (≤ 1,1 triệu khả năng) dù có salt ⇒ quyết khi làm T04-05 (khóa gắn thiết bị / chỉ online / PIN dài hơn).
- 2026-10-20 · `approval_log`: thêm giờ duyệt trên máy (cho duyệt offline đồng bộ sau)? `device_id` cho phép NULL khi duyệt từ backoffice/điện thoại quản lý? → T04-17.
- 2026-10-20 · Máy có `domain_version` MỚI hơn server có được nhận không (cập nhật app trước server)? → T04-03.
- 2026-10-20 · **[đợt 4, high]** Review B1: dòng hủy/hoàn không được so với dòng gốc ⇒ thêm kiểm trong domain (giá, thuế, món, biến thể, cây con của dòng đảo khớp dòng gốc) + LUẬT: server áp lệnh *ý định* (`voidLine`, `buildRefund` dựng lại từ yêu cầu), không bao giờ nhận dòng đảo/đơn hoàn do máy quầy dựng.
- 2026-10-20 · **[đợt 4, medium]** A3: migration phải tự `REVOKE EXECUTE … FROM PUBLIC` cho hàm `fnb_auth` (hiện chỉ an toàn nhờ bước provision của test); test trên DB chỉ-migrate.
- 2026-10-20 · **[đợt 4, medium]** B2: ngưỡng giảm giá/thu-chi tính theo từng thao tác ⇒ giảm 3×10% = 30% không cần duyệt. Sửa: authorize theo tỉ lệ giảm *tích lũy* của dòng/đơn (helper domain), thu/chi tích lũy theo ca (ghi chú cho T04-16).
- 2026-10-20 · **[đợt 4, medium]** A1 + C1: khóa PIN leo thang (khóa lại liên tiếp ⇒ thời gian tăng, tối đa ~24h) + audit sự kiện khóa; test gửi lần thử PIN/đăng nhập song song.
- 2026-10-20 · **[đợt 4, low]** A2 (đúng PIN xóa luôn khóa của request song song), A4 (trigger `UPDATE OF account_id` chạy cả khi không đổi ⇒ xóa mọi phiên), A5 (uuid nhận `urn:`/chữ hoa ⇒ 500), B3 (`quantity(1e-7)` ra 0 thay vì bị chặn), B6 (giảm giá dòng tính theo đơn vị — cần builder "giảm X cho cả dòng"), C2 (test làm tròn VAT/phí dịch vụ theo công thức độc lập), C3 (nhân viên bị vô hiệu giữa ca; `/current` kiểm lại chi nhánh), C4 (grant mang trường thừa), C5 (test cho scrypt giả; thêm `fnb_auth.pairing_code_route` vào GLOBAL_TABLES).
- 2026-10-20 · Gắn `edit_menu` cho mọi route `/catalog`. → đợt 4.
- 2026-10-20 · Nhóm tùy chọn dùng chung: lưu món A có thể đổi/archive option mà món B cũng dùng — kiểm lại món B hay tách nhóm theo món? (chờ quyết)
- 2026-10-20 · Đơn đã thanh toán chưa lưu charge profile lúc bán ⇒ lưu snapshot profile trên đơn để hoàn tiền đúng khi chi nhánh đổi cấu hình. → T04-01.
- 2026-10-20 · Giảm % toàn đơn áp trước khi hủy món giữ số tiền cố định; hủy làm cơ sở nhỏ hơn số giảm ⇒ lỗi. Tầng ứng dụng phải áp lại giảm % sau khi hủy. → T04-17.
- 2026-10-20 · Bộ unit domain ~10s vì property 10.000 vòng đời — cân nhắc 2.000 khi chạy local, 10.000 trong CI (`FNB_LIFECYCLE_RUNS`).
- 2026-10-20 · Lệnh đồng bộ còn thiếu: `order.void_line` (save_draft phải chuyển sang cập nhật theo id khi đã có tham chiếu dòng), giảm giá (kiểm `approvalId`: đúng hành động, đúng nhân viên, dùng một lần), `order.refund` (đọc/ghi refund_line_amount), hủy đơn; payload từng lệnh khai trong `@fnb/contracts`. → đợt 5.
- 2026-10-20 · Charge profile hiện mặc định cứng (giá gồm VAT, không phí dịch vụ) — cần khóa cấu hình theo chi nhánh. → đợt 5.
- 2026-10-20 · `save_draft` có chặn món đang hết (product_availability) không? Món giá mở/cân chưa có trong ý định dòng. → đợt 5.
- 2026-10-20 · Lệnh offline × staff session: hiện chỉ đồng bộ khi có staff session đang sống, người tạo = người đang đăng nhập; cần tôn trọng staffSessionId theo từng lệnh. → T04-05.
- 2026-10-20 · `official_no` / `call_number` không gán được sau khi trả (trigger chỉ cho paid→posted) — luật riêng khi làm hóa đơn điện tử. → T05-07.
- 2026-10-20 · Làm tròn tiền mặt + tiền thừa: `order.pay` đòi Σ thanh toán = amountDue đúng từng đồng. → T04-08.
- 2026-10-20 · Giữ change_log bao lâu (trigger chỉ-thêm chặn cả owner) — cần migration/hàm dọn có chủ đích. → T11.
- 2026-10-20 · PIN khóa tới 24h ⇒ người đứng ở máy quầy có thể khóa quản lý cả ngày — cần thao tác mở khóa của quản lý/backoffice. → T01-10.
- 2026-10-20 · Sau khi hủy một phần, cây con của món bị "đóng băng" (không đổi topping, không thêm giảm dòng); món có giảm cả dòng phải gỡ giảm trước khi hủy. Chấp nhận ở quầy? (chờ user)
- 2026-10-20 · Hoàn tiền offline: `validateRefundAgainstSale` cần cùng danh sách hoàn trước mà máy quầy thấy ⇒ đồng bộ hoàn tiền nên là lệnh ý định server dựng lại. → đợt 5.
- 2026-10-20 · Hai bản kiểm approval: `apps/api/src/sync/shift-command-approval.ts` (ca) và bản của lệnh order.* — hợp nhất thành một; đăng ký lệnh shift.* vào `SYNC_COMMANDS` thay vì nhánh `isShiftCommand`. → đợt 6.
- 2026-10-20 · Duyệt: approval khớp ĐÚNG giá trị (duyệt 20% không dùng cho 19%)? Gắn approval với một đơn? Kiểm lại vai trò người duyệt lúc dùng? (chờ user)
- 2026-10-20 · `order.pay` khi máy không có ca mở ⇒ đang nhận với shift_id NULL (tiền mặt không thuộc két nào) — nên từ chối? Ngưỡng chênh lệch đóng ca mặc định 0 đ; theo từng phương thức? (chờ user)
- 2026-10-20 · Đóng ca có chuyển đơn đã trả sang `posted` không (đang không, để không cản hoàn tiền)?
- 2026-10-20 · Hoàn 1/3 ly có giảm toàn đơn hiện in gross −28.999 / giảm −3.333 (net đúng −25.666) — bill hoàn nên hiện giá bán gốc + dòng giảm? (chờ user)
- 2026-10-20 · In: CP1258 trên máy thật có in dấu thanh thành ô riêng không (lệch cột)? — kiểm ở T00-08; combo có thành phần khác trạm; thay topping sau khi đã gửi bếp chưa được phát hiện là thay đổi; bill chưa có dòng "Làm tròn".
- 2026-10-20 · `applied_command` chưa lưu staff_id của người gửi lệnh.
- 2026-10-20 · POS: parse `/pos/bootstrap` bằng schema của `@fnb/contracts` thay cho parser tối thiểu; ẩn/khóa nhân viên `active=false`; staff session hết hạn ⇒ về màn PIN (đang chỉ hiện server_error); thiết bị bị thu hồi ⇒ xóa credential + ghép lại; endpoint logout staff session. → đợt sau.
- 2026-10-20 · Lưu số khách (guest_count); `openedAt` của bàn lấy createdAt của lệnh mở (bàn mở offline đang hiện giờ đồng bộ); `save_draft` không đổi gì vẫn tăng version ⇒ mất trạng thái "chờ thanh toán"; hủy đơn đang gắn bàn có cần `close_unpaid_table`? (chờ quyết)
- 2026-10-20 · In: in lại bằng job id MỚI có xóa lỗi cũ của cùng chứng từ không? Đơn đã trả giờ tăng version khi gửi bếp — kiểm khi làm hóa đơn/báo cáo.
- 2026-10-20 · Chưa có route backoffice ghi cấu hình (charge profile, công tắc) — phải đi qua saveConfigValue/clearConfigValue + validateFlags. Hết món có hạn (`unavailableUntil`) tự hết không sinh thay đổi ⇒ máy tự so giờ.
- 2026-10-20 · change_log phình theo (món đổi × số chi nhánh) — cần chính sách giữ/gom. → T11.
- 2026-10-20 · Lưu trữ bản web POS: reverse proxy `/api` cùng origin (đang dùng) hay `VITE_FNB_API_BASE` + CORS? → T11-05.
- 2026-10-20 · POS: màn QR tự đổi trạng thái theo intent (đã có snapshot payment_intent); QR thiếu/thừa xử lý thế nào (QR thứ hai cho phần còn lại? tiền mặt? hoàn phần thừa?) — chờ user; mở lại nháp chưa trả sau khi tải lại; số gọi món nên do server cấp lúc trả?; nhóm tùy chọn cần "vai trò" (đường/đá) để in tem ly đúng; hồ sơ máy in theo máy quầy (khổ giấy, code page 1258); combo/giá mở/món cân trên POS.
- 2026-10-20 · `/tmp` là tmpfs + quota chung (~7 GB/user): Postgres nhúng của test để dữ liệu trong os.tmpdir() — nếu gặp EDQUOT thì chuyển thư mục dữ liệu test về ổ home.
- 2026-10-20 · **[gấp, đợt 8]** API thiếu `GET /branches`, `GET /devices?branchId=`, `GET /staff` (hợp đồng đề xuất trong `apps/backoffice` + `e2e/backoffice/support/pending-backoffice-read-routes.ts`); `/auth/me` chưa trả permissionKeys; chuyển ProductDocumentInput → Product bị viết 2 lần (api + backoffice) ⇒ gộp vào gói thuần; lỗi 400 của domain nên mang ids (groupId/optionId/variantId).
- 2026-10-20 · HĐĐT: adapter thật cần sandbox + câu hỏi idempotency của nhà cung cấp; bán của ngày đã chốt đồng bộ muộn ⇒ batch bổ sung tự động hay tay?; ai sửa/đẩy lại hóa đơn failed_permanent, có chặn chốt ngày không; đơn 0đ có xuất hóa đơn không; hoàn tiền: điều chỉnh hay chỉ ghi sổ (mặc định none) — chờ kế toán/user.
- 2026-10-20 · Backoffice: trạm thuộc chi nhánh nhưng món thuộc thương hiệu (product.stationId) — mô hình đúng chưa?; hết món theo kênh/có hạn chưa có UI; sửa/khóa nhân viên, đặt lại PIN, mở khóa PIN, xóa vai trò chưa có UI.
- 2026-10-20 · Dữ liệu đo hiệu năng DB phải nằm trên ổ thật: `/tmp` máy này là tmpfs, fsync gần như miễn phí, số đẹp gấp ~30 lần.
