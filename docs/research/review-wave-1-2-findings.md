# Review đợt 1–2 — fnb-pos @ 2c27849

Bản sao: `/home/datadevice/FileMySelf/FNB-POS/worktrees/review` (chỉ đọc). Ngày: 2026-10-20.

Đã biết, không báo lại: totals ném lỗi dòng hủy; hoàn một phần chưa trừ giảm giá toàn đơn; route backoffice chưa gắn quyền; thiếu rate limit; thiếu job dọn mã/phiên; PIN offline.

## Tiến độ
- [x] 1. Bảo mật DB (migrations 0001–0006) — A3, A4
- [x] 2. Xác thực (auth, devices, staff) — A1, A2, A5
- [x] 3. Tiền & tổng (domain) — B1, B3, B5, B6
- [x] 4. Quyền (permissions) — B2, B4
- [x] 5. Test giả — C1–C5 (mutation 75 đột biến, 7 sống sót)

## Tóm tắt theo mức
- high: B1 (dòng hủy/hoàn không bị so với dòng gốc; đơn hoàn không được kiểm gì)
- medium: A1 (khóa PIN cửa sổ cố định ⇒ vét PIN 4 số trong vài ngày), A3 (EXECUTE `fnb_auth.*` phụ thuộc provision, migration không tự REVOKE), B2 (ngưỡng giảm giá/thu chi theo từng lần ⇒ chia nhỏ là qua), C1 (không test đoán song song; bỏ FOR UPDATE vẫn xanh)
- low: A2, A4, A5, B3, B4, B5, B6, C2, C3, C4, C5

## Phát hiện

### A. Bảo mật DB + xác thực

Đã soát và KHÔNG thấy lỗi: RLS ENABLE+FORCE + 1 policy ALL (USING = WITH CHECK) trên đủ 17 bảng public (test catalog `rls-blocks-cross-tenant-reads` khóa được cả bảng mới lẫn policy thừa); mọi hàm `fnb_auth.*` SECURITY DEFINER đều `SET search_path = pg_catalog, pg_temp` và gọi bảng có schema đầy đủ; FK kép (tenant_id, id) mọi bảng con; fnb_app không có TRUNCATE/REFERENCES/TRIGGER, không sequence nào (UUIDv7); `withTenant` dùng `set_config(..., true)`; trigger chỉ-thêm dạng STATEMENT chặn cả UPDATE/DELETE/TRUNCATE và ON CONFLICT DO UPDATE; claim attempt đếm TRƯỚC khi băm dưới `FOR UPDATE` (đúng cho cả login lẫn PIN); mã ghép dùng `UPDATE … WHERE used_at IS NULL` nên 2 máy tranh 1 mã chỉ 1 thắng; token phiên/thiết bị so qua băm SHA-256 trong SQL (không có so chuỗi bí mật trong JS); `verifySecret` dùng `timingSafeEqual`; login trả 401 giống nhau cho sai mật khẩu/không có tài khoản/đang khóa + scrypt giả; cookie `__Host-` HttpOnly Secure Lax; membership bị đình chỉ bị chặn ngay ở mỗi request.

#### A1 · medium · `apps/api/src/auth/auth-policy.ts:29` + `apps/api/src/security/attempt-lockout.ts:17-24` — khóa PIN cửa sổ cố định, PIN 4 số bị vét cạn trong vài ngày từ 1 máy đã ghép
- Lỗi: khóa 5 phút không leo thang, hết khóa thì đếm lại từ 1 (`failedAttempts = 1`), không ghi audit/không báo ai. Mỗi 5 phút được thử 5 PIN ⇒ ~1.440 lần/ngày. PIN 4 số hợp lệ còn 10.000 − 196 = 9.804 ⇒ vét hết tối đa ~6,8 ngày, trung bình ~3,4 ngày. Bộ đếm theo nhân viên nên nhiều máy không nhanh hơn, nhưng một máy là đủ.
- Kịch bản: nhân viên A đứng ở quầy (máy có device token hợp lệ, cùng chi nhánh), gọi `POST /pos/staff-sessions {staffId: <quản lý>, pin: ...}` theo vòng 5 lần/5 phút ⇒ trong vài ngày lấy được PIN quản lý ⇒ tự duyệt hoàn tiền/giảm giá/mở két (PIN quản lý chính là chữ ký duyệt). Không ai thấy vì không có dấu vết nào ngoài `pin_failed_attempts` bị ghi đè liên tục.
- Thêm: đăng nhập đúng xóa sạch bộ đếm, nên quản lý đăng nhập vài lần mỗi ca còn "tặng" kẻ đoán thêm 4 lượt mỗi lần mà không bao giờ chạm khóa.
- Sửa: (1) ghi `audit_log` mỗi lần khóa (actor = device) và hiện ở backoffice; (2) khóa leo thang theo số lần khóa liên tiếp trong 24h (vd 5'→15'→1h, trần vài giờ) hoặc khóa cứng chờ quản lý mở sau N lần khóa; (3) cân nhắc bắt buộc PIN 6 số cho vai trò có khóa duyệt được (`approvable`).
- Xác nhận: đọc code `claimAttempt` + `DEFAULT_AUTH_POLICY`; tính toán số học. Test `staff-pin-lockout.test.ts` chỉ kiểm 1 cửa sổ khóa.

#### A2 · low · `apps/api/src/routes/pos/staff-session-routes.ts:87-91` (và `fnb_auth.record_login_success`, `0003_accounts_and_sessions.sql:154-160`) — reset khi thành công ghi đè vô điều kiện, xóa luôn lần sai/khóa của request song song
- Lỗi: cổng đếm commit rồi mới băm (đúng), nhưng nhánh thành công chạy transaction mới `SET pin_failed_attempts = 0, pin_locked_until = NULL` không điều kiện. Mọi lần sai được đếm GIỮA lúc claim và lúc reset (kể cả lần đã đặt khóa) bị xóa.
- Kịch bản: quản lý nhập PIN đúng (request R1 claim xong, đang scrypt ~65ms); cùng lúc 5 request đoán của kẻ khác claim xong, request thứ 5 đặt `pin_locked_until`. R1 xong ⇒ reset về 0/NULL ⇒ khóa biến mất, kẻ đoán lại có ngay 5 lượt.
- Sửa: reset có điều kiện theo trạng thái đã claim, vd `UPDATE staff SET pin_failed_attempts = 0, pin_locked_until = NULL WHERE id = $1 AND pin_failed_attempts = $claimed AND pin_locked_until IS NOT DISTINCT FROM $claimedLock`; nếu không khớp thì chỉ giảm 1 (bỏ lần của chính mình) chứ không xóa khóa. Tương tự cho `record_login_success`.
- Xác nhận: đã chạy probe tích hợp trên bản sao repo trong scratchpad (Postgres nhúng, role fnb_app): 1 PIN đúng + 5 PIN sai song song ⇒ trạng thái `201,401,429,401,401,401` (tức khóa ĐÃ được đặt), nhưng sau cùng `pin_failed_attempts=0, pin_locked_until=null` và lần sai kế tiếp trả 401 chứ không 429.

### B. Tiền, đơn, quyền (packages/domain)

Đã soát và KHÔNG thấy lỗi: `divideRounded` (dấu, half-up đối xứng, half-even); `allocateAmount` (tổng đúng, không đổi dấu, trọng số 0 không nhận đồng); `taxByRateGroup` làm tròn 1 lần/nhóm thuế cả 2 chế độ; giảm giá dòng trước, toàn đơn sau; `buildOrderDiscountLines` chia theo nhóm thuế và không vượt net từng nhóm; khung giờ qua nửa đêm thuộc ngày bắt đầu, `start === end` bị chặn; `businessDate`; `splitVoid` giữ bất biến `reversed ≤ sent ≤ quantity` và không xóa dòng gốc khi còn dòng đảo trỏ vào; `canApprove` yêu cầu người duyệt tự làm được (kể cả ngưỡng) + khóa approvable.

#### B1 · high · `packages/domain/src/order/order-line-reversal-rules.ts:21-65, 71-90` — dòng đảo (hủy/hoàn) không bao giờ được so với dòng nó đảo; đơn hoàn thì bỏ qua toàn bộ kiểm tra
- Lỗi: `validateLineTree` chỉ kiểm dòng đảo là item gốc, số lượng âm, đích tồn tại, tổng số lượng đảo ≤ số bán. KHÔNG kiểm `unitPrice`, `taxRate`, `productId/variantId`, và cây con của dòng đảo có đúng là bản sao cây con của dòng gốc không. Với `refundOfOrderId` khác null thì `assertLineQuantity`/`assertNotOverReversed` `return` ngay — không còn kiểm gì. Ngoài `buildRefund` (chạy trên máy) không có hàm nào kiểm một đơn hoàn nhận về so với đơn đã trả. Luật cứng #4 "server không tin tiền client gửi" vì vậy không thực hiện được bằng domain hiện có: server tính lại tổng từ chính các dòng đã bị sửa.
- Kịch bản (đã chạy): (1) bán 1 × 10.000 đ, dòng hủy `{quantity: -1, unitPrice: 100.000, reversesLineId: "sold"}` ⇒ `validateLineTree` qua; (2) dòng hủy đúng giá nhưng gắn thêm modifier con giá 500.000 đ (hiệu lực −500.000 qua cha âm) ⇒ qua; (3) đơn hoàn có dòng `{quantity: -50, unitPrice: 9.999.999, reversesLineId: "không tồn tại"}` ⇒ qua. Một máy bị sửa payload sync (hoặc bug client) xóa được nhiều tiền hơn món đã bán / hoàn tiền khống mà server vẫn nhận. Khi phần sửa "totals với dòng hủy" (đang làm) gộp dòng hủy theo GIÁ CỦA CHÍNH NÓ thì lỗ hổng này thành tiền thật.
- Sửa: thêm vào domain `assertReversalMirrorsTarget(reversal subtree, target subtree, units)` — head phải bằng target trừ `id/parentLineId/quantity/reversesLineId`, con phải khớp 1-1 (cùng loại, giá, thuế, sản phẩm, số lượng theo đơn vị cha); gọi nó trong `validateLineTree` cho đơn thường, và export `validateRefundAgainst(paidOrder, refund, existingRefunds)` (tái dùng phần kiểm của `buildRefund`) để server gọi khi nhận đơn hoàn. Test: 3 kịch bản trên phải đỏ.
- Xác nhận: chạy probe vitest trên bản sao domain trong scratchpad (`zz-probe.test.ts`, P1–P3 xanh = lỗi có thật).

#### B2 · medium · `packages/domain/src/permissions/authorize.ts:34-43, 112-117` — ngưỡng giảm giá/thu chi tính theo TỪNG hành động, nên chia nhỏ là vượt ngưỡng không cần duyệt
- Lỗi: `PermissionAction.discountRate` là mức của một lần bấm; domain không có khái niệm mức giảm tích lũy trên dòng/đơn, cũng không có hàm tính nó. `goodsLineAmounts` cho phép nhiều dòng giảm dưới cùng một item và `buildOrderDiscountLines` cho phép áp giảm toàn đơn nhiều lần (base = phần còn lại).
- Kịch bản (đã chạy): thu ngân mẫu (`line_discount ≤ 10%`): `authorize(30%)` = `needs_approval`, nhưng 3 lần `authorize(10%)` đều `allowed` ⇒ 3 dòng giảm 10.000 đ dưới item 100.000 đ ⇒ `discountTotal = 30.000` (30%), không ai duyệt. Tương tự `cash_move ≤ 500.000 đ`: 10 lần chi 500.000 = 5 triệu không cần quản lý.
- Sửa: định nghĩa trong domain "mức đang xét" = tổng giảm SAU hành động trên phạm vi (item+cây con cho line_discount, cả đơn cho order_discount) chia gross phạm vi, làm tròn LÊN theo basis point; export hàm `cumulativeDiscountRate(order, scope, newDiscountLines)` để POS/server cùng dùng và đưa vào `authorize`. Với cash_move: cộng dồn theo ca (cần dữ liệu ca — ghi backlog nếu chưa có). Nếu chủ quán chấp nhận cộng dồn thì cần ghi rõ vào decision-log (D-029 đang "chờ user").
- Xác nhận: probe P4 (vitest, scratchpad).

#### B3 · low · `packages/domain/src/money/quantity.ts:149-166, 197-203` — số rất nhỏ bị làm tròn về 0 thay vì bị từ chối
- Lỗi: doc nói "More than 3 decimals is rejected, not rounded", nhưng với `number` < 1e-6 JS in dạng mũ nên code đi nhánh `toFixed(3)` ⇒ "0.000" ⇒ 0n. `quantity(0.0001)` thì bị từ chối đúng.
- Kịch bản (đã chạy): `quantity(1e-7)` = `0n`, `quantity(4e-7)` = `0n` (dòng số lượng 0 đi tiếp tới `validateLineTree` mới bị chặn bằng mã khác, hoặc lọt nếu dùng cho lượng tồn kho).
- Sửa: nhánh mũ: nếu `value !== 0 && Math.abs(value) < 1e-3` thì ném `quantityTooPrecise`; hoặc bỏ hẳn nhận `number` thập phân (chỉ nhận chuỗi/bigint).
- Xác nhận: probe P5.

#### A3 · medium · `packages/db/migrations/0003_accounts_and_sessions.sql:19-20, 112-192` + `0004_devices_and_staff.sql:91-94` — quyền EXECUTE của mọi hàm `fnb_auth.*` chỉ đến từ bước provision của test, migration không tự thu hồi; test "not executable by PUBLIC" cho cảm giác an toàn giả
- Lỗi: Postgres mặc định cấp EXECUTE cho PUBLIC; migration không có `REVOKE … FROM PUBLIC` nào, lại `GRANT USAGE ON SCHEMA fnb_auth TO PUBLIC`. Chỉ `provision-test-database.ts:35-38` (ALTER DEFAULT PRIVILEGES — theo TỪNG database) chặn được. Test `sign-in-tables-are-out-of-reach.test.ts:43-59` kiểm `public: false` nên xanh, nhưng nó kiểm bước provision chứ không kiểm migration. Backlog T11-05 đã ghi "runbook phải có default privileges", nhưng một runbook quên/sai DB là lộ hết.
- Kịch bản (đã chạy): DB mới chỉ chạy `runMigrations` (không có bước ALTER DEFAULT PRIVILEGES) ⇒ cả 10 hàm `has_function_privilege('public', …) = true`; role không được cấp gì vẫn gọi được `claim_login_attempt`. Hệ quả ở môi trường thật: mọi role kết nối được DB (role báo cáo/BI, role replica, công cụ admin) gọi `claim_login_attempt('chu@quan.vn', …)` lấy `password_hash` scrypt để bẻ offline, hoặc `create_session(id, sha256(token tự chọn), <account>, <tenant>, …)` để TỰ CẤP phiên đăng nhập backoffice cho bất kỳ tài khoản nào.
- Sửa: trong chính migration (file mới 0007, không sửa file cũ — runner chặn checksum): `REVOKE ALL ON ALL FUNCTIONS IN SCHEMA fnb_auth FROM PUBLIC; REVOKE USAGE ON SCHEMA fnb_auth FROM PUBLIC;` rồi GRANT cho role app theo tên lấy từ cấu hình (hoặc một role nhóm `fnb_app_group` mà runbook gán vào). Đổi test catalog để chạy trên DB scratch chỉ migrate (không provision) — khi đó test này mới bảo vệ migration.
- Xác nhận: probe AP3 (DB scratch qua `createScratchDatabase` + `runMigrations`).

#### A4 · low · `packages/db/migrations/0003_accounts_and_sessions.sql:108-110` (tương tự `0004…:87-89`) — trigger `UPDATE OF account_id, tenant_id` chạy cả khi giá trị không đổi ⇒ xóa `account_tenant` ⇒ CASCADE xóa mọi phiên
- Lỗi: Postgres bắn trigger `UPDATE OF col` khi cột có trong SET, không cần giá trị đổi. Hàm trigger luôn DELETE rồi INSERT lại `account_tenant`; FK `session_membership_fkey ON DELETE CASCADE` xóa hết phiên của account trong tenant đó.
- Kịch bản (đã chạy): đăng nhập ⇒ `/auth/me` 200; `UPDATE membership SET account_id = account_id, status = 'active' WHERE …` ⇒ `/auth/me` 401. Một route sau này cập nhật membership bằng drizzle `.set({...row})` (ghi đủ cột) sẽ âm thầm đăng xuất người dùng mỗi lần lưu. Với `device_pairing_code` thì `UPDATE … SET code_hash = code_hash` xóa rồi chèn lại route (vô hại hơn, nhưng cùng lỗi).
- Sửa: thêm `WHEN (OLD.account_id IS DISTINCT FROM NEW.account_id OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id)` cho trigger UPDATE (tách trigger INSERT/DELETE riêng), hoặc trong hàm `IF TG_OP = 'UPDATE' AND NEW.account_id = OLD.account_id AND NEW.tenant_id = OLD.tenant_id THEN RETURN NULL; END IF;`.
- Xác nhận: probe AP1.

#### A5 · low · `apps/api/src/routes/**` (mọi schema `format: "uuid"`) — ajv nhận `urn:uuid:…` và chữ hoa, Postgres/so chuỗi JS thì không
- Lỗi: ajv-formats 3.0.1 `uuid: /^(?:urn:uuid:)?[0-9a-f]{8}-…$/i`. Postgres không nhận tiền tố `urn:uuid:` ⇒ lỗi 22P02 ⇒ error handler trả 500 `API_INTERNAL` (đáng lẽ 400). `chooseMembership` so `id === organizationId` bằng chuỗi ⇒ UUID viết hoa bị coi là không phải thành viên.
- Kịch bản (đã chạy): `POST /devices/pairing-codes {branchId: "urn:uuid:<id>"}` ⇒ 500; `POST /pos/staff-sessions {staffId: "urn:uuid:…"}` ⇒ 500 (500 làm nhiễu giám sát/alert và là đường dò lỗi); `POST /auth/login {organizationId: <ID VIẾT HOA>}` với mật khẩu đúng ⇒ 403 `API_AUTH_NOT_A_MEMBER`.
- Sửa: dùng `pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"` (chữ thường) thay `format: "uuid"`, hoặc chuẩn hóa `toLowerCase()` trước khi dùng; map lỗi Postgres 22P02 thành 400 trong error handler.
- Xác nhận: probe AP2.

#### B4 · low · `packages/db/migrations/0004_devices_and_staff.sql:99-114` vs `packages/domain/src/permissions/permission-catalog.ts:80-86` — dạng lưu quyền của role không biểu diễn được `Grant[]`
- Lỗi: DB lưu `permission_keys text[]` + MỘT object `thresholds` cho cả role; domain cần ngưỡng THEO TỪNG khóa (`line_discount ≤ 10%` khác `order_discount ≤ 5%`, `cash_move` là bigint đồng). Chưa có chỗ nào định nghĩa map 2 chiều; fixture test còn dùng khóa ngoài danh mục (`order.create`, `payment.take`) và `{maxDiscountBp: 1000}` không khớp tên nào của domain (`maxRate`).
- Kịch bản: khi nối quyền vào API (đợt 3), mỗi người tự đoán key trong `thresholds` ⇒ một role có cả line_discount và order_discount chỉ lưu được một ngưỡng, hoặc ngưỡng bị bỏ qua ⇒ `withinThreshold` coi là không giới hạn (grant không threshold = không giới hạn).
- Sửa: chốt dạng lưu trước khi nối: `thresholds = {"line_discount": {"maxRate": 1000}, "cash_move": {"maxAmount": "500000"}}` (tiền dạng chuỗi thập phân như audit payload), CHECK key ⊆ permission_keys; viết `grantsFromRoleRow()` + test khứ hồi role-templates → DB → Grant[]. Bổ sung vào backlog "kiểm role.permission_keys khớp danh mục".
- Xác nhận: đọc code + grep (không có hàm chuyển đổi nào).

#### B5 · low (cần user quyết) · `packages/domain/src/pricing/select-price-list-item.ts:130-148` — `daysOfWeek` không kèm khung giờ dùng ngày LỊCH, có khung giờ qua đêm thì dùng ngày bắt đầu
- Kịch bản: quán mở tới 02:00, bảng giá "Thứ 7" `{daysOfWeek:[6], timeWindow:null}` ⇒ 00:30 sáng CN (vẫn là ca tối thứ 7, `businessDate` = thứ 7) KHÔNG còn giá thứ 7; còn `{daysOfWeek:[6], timeWindow:{1080,120}}` thì vẫn còn. Cùng ý định "giá tối thứ 7", hai cách khai cho giá khác nhau sau nửa đêm.
- Sửa (nếu user muốn theo ngày kinh doanh): truyền `businessDayStartMinute` vào context và dùng ngày-trong-tuần của `businessDate` cho item không có khung giờ; hoặc ghi rõ quy tắc vào docs + UI backoffice.
- Xác nhận: đọc code.

### C. Test giả / test hở (kiểm bằng mutation trên bản sao trong scratchpad, KHÔNG sửa repo)

Cách làm: copy `packages/domain`, `packages/db`, `apps/api` ra scratchpad (node_modules trỏ symlink về repo, cacheDir riêng), mỗi lần đổi 1 dòng code rồi chạy cả bộ test (domain 525 test; tích hợp 345 test với Postgres nhúng). 52 đột biến domain + 23 đột biến API/migration; bị bắt 68/75. Bộ test nhìn chung tốt (bắt được đổi chiều làm tròn tiền hàng, thứ tự giảm giá, khung giờ, khóa, RLS, search_path, append-only…). Các đột biến SỐNG SÓT:

#### C1 · medium · `apps/api/test/integration/auth/staff-pin-lockout.test.ts` + `backoffice-login.test.ts` — không test nào gửi lần thử SONG SONG; bỏ `FOR UPDATE` thì cả bộ vẫn xanh
- Lỗi: comment ở `0003…sql:121-125` và `staff-session-routes.ts:39-41` nói khóa dòng là thứ chặn đoán song song, nhưng mọi test đều gửi tuần tự.
- Kịch bản (đã chạy): bỏ `FOR UPDATE OF s` ở cổng PIN ⇒ 345/345 xanh; probe 20 PIN sai song song ⇒ bản gốc: 5 lần được băm, 15 lần 429, khóa đặt; bản bỏ khóa: 20/20 được băm, 0 lần 429, `pin_failed_attempts=2`, không khóa. Bỏ `FOR UPDATE` trong `claim_login_attempt` cũng 345/345 xanh.
- Sửa: thêm test "20 lần thử song song ⇒ đúng 5 lần được kiểm, phần còn lại 429/401-khóa, và mật khẩu/PIN đúng ngay sau đó bị từ chối" cho cả login và PIN (dùng `Promise.all` + pool `max` ≥ 20).

#### C2 · low · `packages/domain/src/totals/*.test.ts` — làm tròn VAT cộng thêm (exclusive) và phí phục vụ không được ghim; property test chỉ kiểm tự-nhất-quán
- Kịch bản (đã chạy): đổi `applyRate(amount, rate, "half-up")` → `"down"` trong `tax-by-rate-group.ts:57` ⇒ 525/525 xanh; đổi làm tròn phí phục vụ `compute-order-totals.ts:73` sang `"down"` ⇒ 525/525 xanh. Các ví dụ exclusive hiện có đều ra số chẵn (8% × 45.000 = 3.600). Bộ property `order-totals.property.test.ts` so tổng các đầu ra với nhau, không so với công thức độc lập ⇒ xanh với mọi cách làm tròn.
- Sửa: thêm ví dụ exclusive có phần lẻ ≥ 0,5 (vd 8% × 10.007 = 800,56 ⇒ 801) và phí phục vụ lẻ (5% × 10.010 = 500,5 ⇒ 501); thêm 1 property so `group.tax` với oracle `round_half_up(base × rate / 10000)` (exclusive) / `round_half_up(amount × rate / (10000+rate))` (inclusive).

#### C3 · low · `apps/api/test/integration/auth/staff-session-is-bound-to-device-and-shift.test.ts` — không test nhân viên bị vô hiệu GIỮA ca
- Kịch bản (đã chạy): bỏ `AND s.active` ở `GET /pos/staff-sessions/current` (`staff-session-routes.ts:126`) ⇒ 345/345 xanh. Nhân viên bị cho nghỉ giữa ca vẫn dùng phiên tới 12h nếu ai đó vô tình xóa điều kiện. (Code hiện tại ĐÚNG, chỉ thiếu test.) Cùng chỗ: `/current` không kiểm lại `staff_branch` — rút nhân viên khỏi chi nhánh không cắt phiên đang mở.
- Sửa: test "tắt active sau khi mở ca ⇒ /current 401"; cân nhắc thêm điều kiện `EXISTS staff_branch` cho `/current`.

#### C4 · low · `packages/domain/src/permissions/authorize-rejects-invalid-input.test.ts` — grant khóa tỉ lệ mang thêm `maxAmount` vẫn được nhận
- Kịch bản (đã chạy): bỏ `!("maxAmount" in threshold)` ở `authorize.ts:96` ⇒ 525/525 xanh. Dữ liệu role hỏng `{key:"line_discount", threshold:{maxRate:1000, maxAmount:…}}` sẽ không bị "fail loudly" như doc hứa nếu ai sửa dòng đó.
- Sửa: thêm case vào bảng `corrupt` của test.

#### C5 · low · `apps/api/test/integration/auth/backoffice-login.test.ts` — không có gì giữ được "scrypt giả cho tài khoản không tồn tại/đang khóa"
- Kịch bản (đã chạy): xóa `await verifySecret(password, await dummyHash)` ở `login-route.ts:46` ⇒ 345/345 xanh; khi đó tài khoản không tồn tại trả lời nhanh hơn ~65ms ⇒ dò được email nào có tài khoản.
- Sửa: test tất định thay vì đo giờ: inject một `verifySecret`/hasher đếm số lần gọi qua context (hoặc spy) và kiểm "unknown/locked vẫn gọi đúng 1 lần".
- Ghi chú: thêm `sign-in-tables-are-out-of-reach.test.ts:12` thiếu `fnb_auth.pairing_code_route` trong `GLOBAL_TABLES` (hiện app role đúng là không đọc được, nhưng không có test giữ).

#### B6 · low · `packages/domain/src/order/order-line-tree.ts:129-143` + `totals/goods-line-amounts.ts:191-206` — giảm giá dòng tính THEO ĐƠN VỊ của item, domain không có builder; "giảm X đồng cho cả dòng" nhiều ly không biểu diễn chính xác được
- Lỗi: dòng giảm dưới item có `effectiveQuantity = q_giảm × q_item` (đúng ý đồ, test `line-discount-scope` ghim "5.200 mỗi ly × 2 ly"). Nhưng domain chỉ có `buildOrderDiscountLines` cho giảm toàn đơn; giảm dòng để caller tự dựng (tự chia theo nhóm thuế, tự hiểu "theo đơn vị").
- Kịch bản (tính toán): dòng 3 ly × 33.000 đ, thu ngân nhập "giảm 10.000 đ cho dòng". Caller ngây thơ dựng `{unitPrice: -10.000, quantity: 1}` ⇒ domain trừ 30.000 (gấp 3). Muốn đúng 10.000 thì cần `unitPrice × q_giảm × 3 = 10.000.000` (đơn vị nghìn) — không có nghiệm nguyên ⇒ chỉ ra 9.990 hoặc 10.002. Combo có thành phần khác thuế suất còn phải tự tách 2 dòng giảm.
- Sửa: thêm `buildLineDiscountLines(order, itemLineId, {percent|fixed}, ids)` song song với bản toàn đơn: tính tổng một lần, chia theo nhóm thuế bằng `allocateAmount`, và cho dòng giảm dưới item một cờ/kiểu "tổng tuyệt đối" (không nhân số lượng cha), hoặc quy ước dòng giảm luôn `quantity = 1/q_item`… (cách đầu sạch hơn). Gộp với B2 (mức giảm tích lũy) vì cùng một API.
- Xác nhận: đọc code + test hiện có + tính toán.

## Câu hỏi mở (không phải lỗi, cần user/BA chốt)
- Phí phục vụ khi giá đã gồm VAT đang tính trên số đã gồm VAT (`compute-order-totals.ts:73`, base = netTotal gồm thuế) rồi lại coi là đã gồm thuế; có đúng thông lệ hóa đơn của quán pilot không?
- B5: bảng giá theo thứ trong tuần dùng ngày lịch hay ngày kinh doanh?
- A1: chấp nhận PIN 4 số cho vai trò có khóa duyệt được không?

## Cách tái hiện các probe
Toàn bộ chạy ngoài repo: bản sao ở `/tmp/claude-1000/-home-datadevice-GrowX-growx-claude-knowledge/bf1a862d-bdb6-4a85-b398-c2f3d3446455/scratchpad/` (`domain-copy/`, `repo-copy/`, `mutate.py`, `mutate-api.py`, `zz-probe.test.ts.keep`, `zz-api-probe.keep/`). Bản sao `repo-copy/node_modules` là symlink tới node_modules của repo (chỉ đọc); Postgres nhúng dữ liệu ở `os.tmpdir()`.
