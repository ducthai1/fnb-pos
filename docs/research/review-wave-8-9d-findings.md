# Review đợt 8–9d — fnb-pos @ c86358c (từ b386606)

Bản sao: `worktrees/review3` (HEAD tách rời, chỉ đọc); probe ở `worktrees/review3/tmp/review/probes/` (không commit). Ngày: 2026-10-21 (bắt đầu 00:19).
Đã đọc trước: `docs/research/review-wave-1-2-findings.md`, `docs/research/review-wave-3-7-findings.md`, D-040…D-060, mục "Backlog phát sinh" — không báo lại các mục đã có ở đó.

## Tiến độ
- [x] 1. Server thật + dev stack + provisioning + kiểm Origin + cookie — X1, X7 (low); T2, T3 (test hở)
- [x] 2. Giờ lệnh do server quyết + ngày kinh doanh quanh 04:00 — X3, X4, X8 (low)
- [x] 3. Bàn: lệnh bàn, save_draft expectedVersion, occupancy, bootstrap, POS floor/table-order — X2 (medium); T1, T7
- [x] 4. Duyệt/hủy/giảm/hoàn/đóng ca (POS + server) — X5 (medium), X6 (low); T5
- [x] 5. HĐĐT, refundDue "đã hoàn", công cụ nhân viên — X9 (low); T4, T6
- [x] 6. Backoffice từ 9b (quyền route, tenant, bí mật webhook) — không thấy lỗi (xem "Đã soát")
- [x] 7. Test giả — 52 đột biến, 10 sống (8 thật + 2 tương đương)

## Tóm tắt theo mức
- high: không có.
- medium: X2 (tạm tính gắn cho phiên bản đơn máy in chưa thấy ⇒ bàn "chờ thanh toán" trên tờ thiếu món), X5 (két máy quầy bỏ đơn mang từ ca trước + approval đóng ca không mang số tiền ⇒ quản lý duyệt "0 ₫" mà server ghi thiếu thật), T1 (không test bàn đã TRẢ trở về trống), T6 (test hạn gọi HĐĐT là phép đo một chiều).
- low: X1 (dev stack mồ côi/`--reset` xóa dữ liệu stack đang khởi động), X3 (máy nhanh ≤2′ qua mốc giá ⇒ thanh toán bị từ chối), X4 (hoàn tiền QR sau chốt ngày làm báo cáo ngày đã chốt lệch), X6 (sau "Đổi nhân viên" approval thu/chi không khớp), X7 (500 không được log), X8 (bảng theo giờ xếp 0→23), X9 (khóa nhân viên lúc đang nhập PIN ⇒ phiên hồi sinh khi mở khóa), T2–T5, T7.

Probe: `tmp/review/probes/*.probe.test.ts` (5 file, 6 test, cả bộ XANH lúc 00:53, ~9 s) — mỗi test XANH = lỗi có thật; cách chạy ở cuối.

## Phát hiện

### A. Server thật + dev stack

#### X1 · low · `scripts/src/dev-stack/start-dev-stack.ts:72-77,131-137` + `dev-child-process.ts:27-32` — Ctrl+C lần hai (hoặc tiến trình cha chết) bỏ lại API/vite/next mồ côi; file `running-stack.json` chỉ ghi sau khi mọi thứ đã lên nên `--reset` của lần chạy thứ hai xóa dữ liệu dưới chân một stack đang khởi động
- Lỗi: con được `spawn(..., { detached: true })` (nhóm tiến trình riêng ⇒ không nhận SIGINT của terminal) và chỉ được dừng bởi `stopAll`. Handler gắn bằng `process.once`, nên lần Ctrl+C thứ hai rơi về hành vi mặc định: tiến trình cha chết ngay, `stopAll` dở dang, `removeRunningStack()` không chạy. Mỗi con có ân hạn 8 s và dừng tuần tự (next dev thường mất vài giây) ⇒ người dùng sốt ruột bấm Ctrl+C lần nữa là chuyện thường. Ngoài ra (cần xác nhận) Postgres nhúng được `embedded-postgres` spawn không detached, nên cùng nhóm tiến trình foreground với lệnh `pnpm` và nhận SIGINT của terminal ngay lần đầu ⇒ tắt trước API (thứ tự "con trước, DB sau" trong `stopAll` không giữ được, API in "database connection lost").
- Kịch bản: `pnpm dev:stack` → Ctrl+C → trong 8 s đầu bấm Ctrl+C lần nữa ⇒ còn sống: `node --import tsx src/server/main.ts`, `vite`, `next dev` (giữ cổng 4300/5173/3300); lần chạy sau: `livePids(previous.pids)` thấy chúng ⇒ "Một pnpm dev:stack khác đang chạy (PID …). Dừng nó trước." mà không có lệnh nào để dừng (người dùng phải tự `kill` theo PID — dễ kill nhầm khi PID đã bị tái dùng sau khởi động lại máy). Biến thể: stack A đang chờ `next dev` (tới 240 s), chưa ghi `running-stack.json`; chạy `pnpm dev:stack --reset` ở cửa sổ khác ⇒ kiểm "đang chạy" qua ⇒ `rm -rf tmp/dev-stack` xóa thư mục dữ liệu Postgres + `credentials.json` của stack A đang chạy.
- Sửa: dùng `process.on` và ở lần tín hiệu thứ hai gửi SIGKILL tới các nhóm con đã biết rồi mới thoát; ghi `running-stack.json` (chỉ pid của chính nó) NGAY khi bắt đầu, cập nhật pid con khi spawn; khi `livePids` báo còn sống mà tiến trình cha đã chết thì in lệnh dừng (hoặc thêm `pnpm dev:stack --stop`). Cân nhắc spawn Postgres trong nhóm riêng để thứ tự dừng được giữ.
- Xác nhận: đọc code (không chạy — cổng dev của chủ dự án đang dùng). Chỉ ảnh hưởng máy dev.


#### X7 · low · `apps/api/src/build-app.ts:92,114-122` — server thật không ghi lại bất kỳ lỗi 500 nào (Fastify `logger: false`, error handler nuốt lỗi) ⇒ sự cố production không để lại dấu vết
- Lỗi: `setErrorHandler` trả `{ code: API_INTERNAL }` mà không log; `main.ts` chỉ in dòng khởi động/dừng; không có access log. Mọi `throw new Error(...)` của handler (vd `"buildRefund returned a refund without its amounts"`, `"staff … of a signed-in till is missing"`, `"shift_close_difference_tolerance is not an amount"`, lỗi SQL ràng buộc) biến mất sau câu 500.
- Kịch bản: sau deploy, một cấu hình hỏng (`shift_close_difference_tolerance` lưu sai dạng) làm mọi `shift.close` của chi nhánh trả 500; máy quầy thử lại mãi, chủ quán gọi hỗ trợ — server không có một dòng log nào nói lỗi gì, ở route nào, tenant nào.
- Sửa: `onError` hook (hoặc trong error handler) ghi `request.method`, `routeOptions.url`, mã lỗi, `error.message`/stack ra stderr qua `log` của `main.ts` (không ghi body/headers để khỏi lộ PIN/token); cân nhắc access log tối thiểu (method, route, status, thời gian). Test: entrypoint test gây 500 và kiểm stderr có route + không có giá trị nhạy cảm.
- Xác nhận: đọc code (grep `console.`/`log` trong `apps/api/src`).

### B. Giờ lệnh + ngày kinh doanh

#### X3 · low · `apps/api/src/sync/command-time.ts:54` × `apps/pos/src/features/menu/menu-prices.ts:13-27` — máy nhanh ≤ 2′ được nhận nhưng bị kẹp về giờ nhận, trong khi POS định giá bằng đồng hồ máy ⇒ quanh mốc đổi giá (giờ vàng, hết món có hạn) hai bên ra hai giá khác nhau
- Lỗi: `readCommandTime` nhận lệnh có `createdAt ≤ receivedAt + 2′` nhưng `effectiveAt = min(createdAt, receivedAt)`; `save_draft` định giá dòng mới tại `effectiveAt` (`save-draft-command.ts:47-49`), `refuseSoldOut` cũng vậy. POS định giá cùng dòng bằng `Date.now()` của máy (`unitPriceOf(..., at)`), rồi gửi `order.pay.expectedAmountDue` theo giá của máy (`pay-sale.ts:32-55`). Server so đúng từng đồng (`pay-order-command.ts:31`).
- Kịch bản (đã chạy, probe `clock-boundary.probe.test.ts`): bảng giá "giờ vàng" trà đào −50% từ 14:00. Server ở 13:59:00, máy quầy nhanh 90 s (14:00:30 — trong biên, không bị từ chối). Hàm `unitPriceOf` của POS trên menu bootstrap thật ⇒ 17.500; `save_draft` accepted nhưng dòng định giá 35.000 (`effectiveAt` = 13:59:00); `order.pay` 17.500 ⇒ rejected `DOMAIN_ORDER_TOTAL_MISMATCH` — sau khi khách đã trả theo màn hình. Máy chậm giờ thì không lệch (effectiveAt = giờ máy). Chỉ xảy ra trong ~2′ quanh mốc và khi lệnh tới server trong 2′ đó — hiếm, nhưng rơi đúng giờ cao điểm đổi giá.
- Sửa: một trong hai — (a) trong biên +2′ coi `effectiveAt = createdAt` (biên chỉ để tha thứ lệch nhỏ, kẹp về receivedAt làm nó vô nghĩa cho giá), giữ kẹp cho phần quá khứ; hoặc (b) POS định giá/hiện tổng theo snapshot server trả về của `save_draft` trước khi cho thanh toán. Test: máy +90 s qua mốc giá ⇒ save + pay cùng lô đều accepted và tổng khớp.
- Xác nhận: probe XANH (giá phía máy tính bằng chính `unitPriceOf` + `buildTillMenu` của POS). Chưa xác nhận: POS có kịp nhận snapshot của `save_draft` để đổi giá trước khi bấm thanh toán không — ở quầy hai lệnh thường đi chung một lô.

#### X4 · low · `apps/api/src/payments/hand-back-qr-money.ts:58-67` + `reports/qr-refunds-of-the-day.ts:14-19` — đánh dấu "đã hoàn tiền QR" sau khi ngày đã chốt vẫn ghi vào ngày đó ⇒ báo cáo sống của ngày đã chốt lệch con số chốt đã đóng băng
- Lỗi: `refund_business_date` = ngày kinh doanh của "bây giờ"; không kiểm `day_close`. Từ 9d báo cáo ngày (và `day_close.summary.report`, `day-summary.ts:22`) có `qrRefunds`. Đơn trả sau chốt có cờ `paid_after_day_close` và bị loại khỏi báo cáo để "báo cáo ngày đã chốt không đổi" (D-053), nhưng hoàn tiền QR không có cờ tương tự. (Tương tự, nhẹ hơn: `voidsOfTheDay`/`cancelledOrderCount` không loại đơn `paid_after_day_close`/đơn hủy đồng bộ muộn.)
- Kịch bản (đã chạy, probe `day-close.probe.test.ts`): QR 39.000 khách chuyển 40.000, quầy thu tiền mặt ⇒ 40.000 "cần hoàn". Quản lý chốt ngày 2026-10-20 (summary `qrRefunds.count = 0`). Sau đó bấm "đã hoàn cho khách" ⇒ 201, `businessDate = 2026-10-20` ⇒ `GET /reports/daily-sales` ngày đó trả `qrRefunds.count = 1` ≠ bản chốt. Kế toán đối chiếu báo cáo ngày với bản chốt sẽ thấy lệch không giải thích được; ngày hôm sau cũng không có khoản này.
- Sửa: khi ngày của "bây giờ" đã chốt thì hoặc ghi sang ngày mở kế tiếp, hoặc giữ ngày nhưng đánh dấu `after_day_close` và loại khỏi báo cáo sống của ngày đó (liệt kê bên cạnh như `paidAfterClose`). Test: chốt ngày → hoàn tiền QR → báo cáo sống ngày đó = summary.
- Xác nhận: probe XANH.

#### X8 · low · `apps/api/src/reports/daily-sales-report.ts:70,98-99` + `apps/backoffice/src/components/reports/daily-sales-tables.tsx:77-82` — doanh thu theo giờ xếp theo giờ lịch 0→23, nên đuôi đêm (00:00–03:59) của ngày kinh doanh hiện ở ĐẦU bảng, trước 04:00
- Lỗi: cùng loại với fbf014b — `byHour` lấy `localClockParts(paid_at).minuteOfDay / 60` và sắp `a - b`; ngày kinh doanh chạy 04:00 → 03:59 hôm sau. Backoffice in nguyên thứ tự.
- Kịch bản: quán đêm, ngày 2026-10-20 bán từ 18:00 tới 02:00 sáng 21/10 ⇒ bảng "Theo giờ" của ngày 20/10: 0h, 1h, 18h, 19h…23h — người xem đọc 0h/1h như đầu ngày 20 (trước khi mở cửa). Không sai tiền, sai cách đọc; biểu đồ giờ cao điểm sẽ vẽ lệch.
- Sửa: sắp theo `(hour*60 − dayStartMinute + 1440) % 1440` của chi nhánh (server biết `business_day_start_minute`), hoặc trả thêm `minuteFromDayStart`; test: đơn 01:00 đứng sau đơn 23:00 trong `byHour`.
- Xác nhận: đọc code.

### C. Bàn

#### X2 · medium · `apps/api/src/sync/mark-pre-bill-printed-command.ts:13-19` + `packages/contracts/src/sync/commands/table-payload-schemas.ts:20` — "đã in tạm tính" được gắn cho phiên bản đơn mà máy in chưa từng thấy ⇒ bàn hiện "chờ thanh toán" trên tờ tạm tính thiếu món
- Lỗi: payload chỉ có `orderId`; server đặt `pre_bill_printed_version = version + 1` theo phiên bản ĐANG có lúc lệnh tới, không theo phiên bản máy đã in. Bản sửa của Backlog ("chỉ có preBillPrinted nên 'đã đổi sau tạm tính' chỉ đúng trên máy đã thấy bản tạm tính ⇒ cần preBillPrintedVersion") vì thế còn hở đúng ở trường hợp nhiều máy — trường hợp nó được làm ra để bắt.
- Kịch bản (đã chạy, probe `tables.probe.test.ts`): máy A mở bàn B01 với 1 cà phê (v1) và in tạm tính (lệnh mark còn trong hàng đợi, mạng chậm hoặc offline). Máy B thêm 1 cà phê từ v1 (`expectedVersion` đúng) ⇒ accepted (v2). Lệnh mark của A tới sau ⇒ accepted, `preBillPrinted = true`, `GET /floor/occupancy` trả `awaiting_payment` cho đơn 2 ly trong khi tờ khách cầm ghi 1 ly. Người thu tiền ở máy B thấy "đã in tạm tính, chưa đổi" ⇒ không in lại ⇒ khách cầm tờ 29.000 bị đòi 58.000 (hoặc máy A thu 29.000 rồi `order.pay` bị từ chối `DOMAIN_ORDER_TOTAL_MISMATCH`).
- Sửa: payload mang `printedVersion` (phiên bản máy in); server chỉ đặt `pre_bill_printed_version = version + 1` khi `printedVersion = version`, ngược lại nhận lệnh nhưng giữ trạng thái "đã đổi sau tạm tính" (hoặc từ chối `SYNC_ORDER_VERSION_STALE` kèm snapshot để máy in lại). Test: kịch bản trên ⇒ status `occupied`/`preBillPrinted=false`.
- Xác nhận: probe XANH.

### D. Duyệt / hủy / hoàn / đóng ca

#### X5 · medium · `apps/pos/src/features/shift/shift-cash.ts:28-29` + `apps/pos/src/app/close-shift-flow.tsx:81-84` + `apps/api/src/sync/close-shift-command.ts:29-31` — két máy quầy bỏ sót đơn mở từ ca trước; khi server từ chối, POS xin quản lý duyệt "chênh lệch 0 ₫" và approval (không mang số tiền) được server dùng để chấp nhận khoản thiếu thật
- Lỗi: (1) `tillShiftLedger` chỉ tính đơn có `orderId >= shift.id` (UUIDv7 ⇒ "đơn tạo sau khi mở ca"), trong khi server tính theo `payment.shift_id` (tiền vào ca nào). Đơn mở ở ca trước (bàn ngồi qua giờ giao ca — `shift.close` cố ý không chặn nháp) và trả ở ca này bị máy bỏ ra; tiền của máy cầm tay trả vào ca này cũng vậy (`order.deviceId !== shift.deviceId`). Snapshot ca của server có sẵn `figures.cashSales/expectedCash` nhưng POS chỉ lấy `openingCash/cashIn/cashOut`. (2) Khi server trả `SYNC_APPROVAL_REQUIRED`, `useCloseRefused` bật cờ và lần đóng sau xin duyệt với câu `closeDifference(formatVnd(assessment.difference))` — số chênh của MÁY. (3) `accept_close_difference` là khóa không giá trị: approval không mang số tiền, server chấp nhận nó cho bất kỳ chênh lệch nào nó tự tính (`requirePermission(context, ACCEPT_CLOSE_DIFFERENCE, …)`). Ba chỗ cộng lại: quản lý duyệt một con số khác con số server ghi nhận.
- Kịch bản (đã chạy, probe `shift-close.probe.test.ts`): ca 1 mở 500.000; mở đơn 29.000 (bàn); đóng ca 1 đếm 500.000 (khớp); mở ca 2 500.000; bàn trả 29.000 tiền mặt vào ca 2; thu ngân bỏ túi 29.000 và đếm 500.000. Máy: dự kiến 500.000, chênh 0 ⇒ gửi đóng ca không xin ai ⇒ server từ chối `SYNC_APPROVAL_REQUIRED` (dự kiến 529.000). Máy xin quản lý "chấp nhận chênh lệch 0 ₫" ⇒ quản lý nhập PIN ⇒ đóng ca lần hai accepted, `close.difference = −29.000`, `close_approval_id` = approval của quản lý. Màn kết thúc (`T.done(formatVnd(assessment.difference))`) và phiếu đóng ca in (`shiftCloseSlip({ …, assessment })`) đều ghi "chênh lệch 0 ₫" — số của máy; câu `serverDisagreed` chỉ nói "máy chủ tính ra chênh lệch" mà không nói bao nhiêu. Chiều ngược lại (két đúng) thì máy báo "thừa 29.000" giả và buộc xin duyệt ở mọi ca có bàn qua giờ giao ca. Biến thể (đọc code): bàn mở ở quầy A (A có ca), khách ra trả ở quầy B ⇒ tiền vào két B (`shiftId` của B) nhưng `order.deviceId` = A nên két A vẫn cộng khoản đó ⇒ A báo thiếu giả, B báo thừa giả (snapshot đơn chưa có `shiftId` — Backlog).
- Sửa: POS dựng tiền dự kiến từ snapshot ca của server (`figures.expectedCash`, cộng phần offline chưa đồng bộ nếu cần) thay vì lọc đơn theo id; khi server từ chối, hiện số của server (lời từ chối nên mang `expectedCash`/`difference`). Server: ghi số chênh vào approval (`amount` = |difference| hoặc difference có dấu) và `requirePermission` đòi khớp đúng như giảm giá/thu chi (D-040), để approval cho "0 ₫" không dùng được cho "−29.000". Test: kịch bản trên ⇒ approval 0 ₫ bị `SYNC_APPROVAL_FOR_ANOTHER_ACTION`; ledger của máy = server khi có đơn mang từ ca trước.
- Xác nhận: probe XANH (phần máy quầy chạy chính hàm `tillShiftLedger` của POS; phần server chạy qua API). Lưu ý: đột biến M35 (bỏ điều kiện `orderId < shift.id`) bị `shift-cash.test.ts` GIẾT — test hiện tại ghim đúng hành vi sai này, sửa X5 phải sửa cả test đó.

#### X6 · low · `apps/pos/src/features/shift/shift-cash.ts:43-57` × `apps/api/src/sync/approval-redemption.ts:120-126` — sau "Đổi nhân viên" trên cùng két, POS xin duyệt thu/chi theo TỔNG của két, server đòi approval khớp ĐÚNG số của riêng người đó ⇒ lệnh chi bị từ chối sau khi tiền đã ra khỏi két
- Lỗi: `cashMoveActionFor` gán toàn bộ `figures.cashIn/cashOut` của ca cho người đang đăng nhập (chú thích: "never less than the server's own figure, so the till never lets through alone what the server would refuse"). Hướng "không bao giờ ít hơn" chỉ an toàn cho quyết định allowed/approval; nhưng approval được server so khớp ĐÚNG giá trị (`approval.payload.amount === action.amount`), nên số lớn hơn của máy làm approval vô dụng. Gốc (snapshot ca không có thu/chi theo nhân viên) đã ở Backlog 2026-10-21; hệ quả từ chối-sau-khi-chi chưa được ghi.
- Kịch bản (đã chạy, probe `shift-close.probe.test.ts` › X-cashmove): mức tự chi của thu ngân 500.000. A chi 300.000 (accepted). "Đổi nhân viên" sang B, B chi 300.000 (accepted). Đổi lại A, A chi 300.000: máy tính A = 900.000 ⇒ xin quản lý duyệt 900.000; server tính A = 600.000 ⇒ cần approval đúng 600.000 ⇒ `SYNC_APPROVAL_FOR_ANOTHER_ACTION`. Máy đã ghi lệnh vào hàng đợi và tiền đã đưa ra; sổ server thiếu khoản chi ⇒ lúc đóng ca két "thiếu" 300.000 và phải xin duyệt chênh lệch (đúng loại approval không mang số tiền ở X5).
- Sửa: snapshot ca mang thu/chi theo `staffId` (đã có trong Backlog) và POS dùng nó; trước đó, chấp nhận approval có `amount ≥` số server tính cho `cash_move` (D-040 vẫn "chờ user": khớp đúng hay ≥), hoặc POS gửi kèm số tiền của riêng lần chi để server so. Test: kịch bản trên ⇒ accepted với approval của quản lý.
- Xác nhận: probe XANH (chạy `cashMoveActionFor` của POS trên figures thật server trả về).

### E. HĐĐT, refundDue, công cụ nhân viên

#### X9 · low · `apps/api/src/routes/pos/staff-session-routes.ts:32-45` × `routes/staff/staff-access-routes.ts:64-82` — khóa nhân viên đúng lúc họ đang nhập PIN để lại một phiên sống; mở khóa lại thì phiên đó hồi sinh (trái D-060 "mở lại không hồi sinh phiên cũ")
- Lỗi: đăng nhập PIN gồm 3 bước tách giao dịch: `claimPinAttempt` (khóa dòng staff, kiểm `active`, commit) → `verifySecret` (scrypt, chậm, ngoài giao dịch) → `INSERT staff_session` trong giao dịch mới mà KHÔNG kiểm lại `active`. `deactivate` chạy giữa bước 1 và 3 thu hồi các phiên đã có — phiên sắp tạo chưa có nên không bị thu hồi. Khi khóa còn hiệu lực phiên vô dụng (`findCurrentStaffSession` kiểm `s.active`), nhưng `reactivate` không đụng tới phiên ⇒ phiên đó sống lại tới `expires_at`. Cùng khe hở ở `/pos/approvals`: `canApprove` (`approval-routes.ts:111`) đọc vai trò nhưng không đọc lại `active` của người duyệt ⇒ approval do một quản lý vừa bị khóa cấp vẫn được ghi.
- Kịch bản (đã chạy, probe `staff-lock.probe.test.ts`, chèn việc khóa vào đúng bước kiểm PIN qua `verifySecret` của `buildApp`): nhân viên nhập PIN ⇒ quản lý bấm "Khóa" ⇒ đăng nhập trả 201 + token; trong lúc khóa `GET /pos/staff-sessions/current` 401; quản lý "Mở khóa" ⇒ cùng token trả 200. Thực tế: nhân viên bị khóa vì nghi gian lận đúng lúc đang đăng nhập, tuần sau được mở lại để bàn giao ⇒ token cũ (máy quầy còn giữ, TTL phiên) dùng tiếp mà không cần PIN.
- Sửa: chèn phiên bằng `INSERT … SELECT … FROM staff WHERE id = $1 AND active` (0 dòng ⇒ 401), hoặc lưu `staff.version` lúc claim và đòi khớp khi chèn; `canApprove` đọc lại `active` trong cùng giao dịch ghi approval. Test: như probe ⇒ đăng nhập 401 / sau mở khóa token vẫn 401.
- Xác nhận: probe XANH (phần đăng nhập). Phần approval: đọc code (route import thẳng `verifySecret` nên không chèn được bước khóa).

### F. Test giả / test hở (đột biến trên bản sao review3, mỗi lần chỉ chạy file test liên quan, `--maxWorkers=1`, hoàn nguyên bằng `git checkout --`; script `tmp/review/mutation/mutate.py` + `batch2.py`, kết quả `tmp/review/mutation/results.txt`)

#### T1 · medium · `apps/api/test/integration/tables/*` — không test nào kiểm bàn của đơn ĐÃ TRẢ trở về "trống" trên `GET /floor/occupancy` (đột biến M18 sống)
- Đột biến: `table-occupancy-route.ts:40` `o.status = 'draft'` → `o.status IN ('draft', 'paid')` ⇒ 3 file test bàn (`floor-screen-shows-its-own-branch`, `one-open-order-per-table`, `table-order-says-when-it-opened-and-its-pre-bill`) vẫn xanh. Test "frees the table once its order is closed" đóng đơn bằng `order.cancel`, không bằng `order.pay`; helper `occupancy()` dựng `Map` theo id bàn nên bản ghi trùng (một bàn join ra 2 đơn) cũng bị nuốt.
- Hậu quả nếu hồi quy: mọi bàn từng có khách đã trả tiền hiện "có khách" mãi, và một bàn có cả đơn đã trả lẫn đơn mới hiện ngẫu nhiên đơn nào.
- Sửa: thêm test trả tiền (`order.pay`) đơn bàn ⇒ `seatingOf` = `{ status: "free", orderId: null }`; kiểm số dòng `tables` = số bàn.

#### T2 · low · `apps/api/test/integration/server/api-entrypoint-serves-and-stops.test.ts:83-92` — "refuses a role that bypasses RLS" chỉ thử SUPERUSER; bỏ điều kiện `rolbypassrls` vẫn xanh (M6 sống)
- Đột biến: `start-server.ts:61` bỏ `|| role.rolbypassrls`. Role BYPASSRLS không superuser (đúng thứ một admin RDS hay cấp nhầm) chạy được API mà mọi chính sách RLS vô hiệu.
- Sửa: tạo role `NOSUPERUSER BYPASSRLS LOGIN` trong test (superuser của Postgres nhúng làm được) và kiểm exit 1.

#### T3 · low · `apps/api/src/http/allowed-origins-hook.test.ts` — danh sách phương thức "chỉ đọc" và `Origin: null` không được ghim (M1, M2 sống)
- Đột biến: thêm `"DELETE"` vào `READ_ONLY_METHODS` (M1) ⇒ `DELETE /roles/:id`, `DELETE /settings/...`, `DELETE /floor/...` từ trang lạ không còn bị chặn — cả unit lẫn test entrypoint vẫn xanh. Cho qua `Origin: null` (M2) — trang trong iframe sandbox/`Referrer-Policy: no-referrer` gửi đúng giá trị này — cũng xanh.
- Sửa: test bảng cho mọi phương thức ghi (POST/PUT/PATCH/DELETE) với origin lạ ⇒ 403, và `Origin: null` ⇒ 403.

#### T4 · low · `apps/api/test/integration/staff/archiving-a-role.test.ts` — không có ca role còn được một THÀNH VIÊN backoffice giữ (M22 sống)
- Đột biến: `archive-role-route.ts:47` bỏ `|| members.rows.length > 0` ⇒ xanh. D-060 nói "từ chối khi còn người giữ (kể cả người bị khóa)" — phần membership không có test.

#### T5 · low · `apps/api/test/integration/sync/sync-approval-is-timed-by-the-server.test.ts` — cận dưới "lệnh ghi trước lúc duyệt quá 2′" không được test (M34 sống)
- Đột biến: `approval-redemption.ts:110` bỏ `recordedAt >= givenAt - APPROVAL_TILL_CLOCK_SLACK_MS` ⇒ xanh. Lệnh có `createdAt` sớm hơn lúc duyệt (máy chậm giờ / lệnh sửa tay) dùng được approval.

#### T6 · medium · `apps/api/test/integration/einvoice/provider-slower-than-the-lease.test.ts:35,58-83` — test "given up before the lease ends" lấy hạn từ chính `providerCallTimeoutMs` ⇒ đổi hạn thành DÀI HƠN lease vẫn xanh (M45 sống)
- Đột biến: `einvoice-retry-policy.ts:34` `return policy.leaseMs + 60_000` ⇒ cả `provider-slower-than-the-lease` và `daily-batch-slower-than-the-lease` xanh. `const TIMEOUT = providerCallTimeoutMs(POLICY)` là phép đo một chiều: test chỉ kiểm "tín hiệu bắn đúng lúc hàm đó nói", không kiểm "trước khi lease hết". Đây là đúng thuộc tính cốt lõi của bản sửa W9 (D-058).
- Sửa: thêm `expect(TIMEOUT).toBeLessThan(POLICY.leaseMs)` (tốt hơn: hằng số độc lập, vd lease 120 s ⇒ hạn 100 s), và một ca advance `POLICY.leaseMs` mà tín hiệu phải đã bắn từ trước.

#### T7 · low · `apps/api/test/integration/{pos,floor}/*` — khu vực bị lưu trữ không được kiểm là gửi `null` qua feed (M41 sống)
- Đột biến: `announce-floor-to-tills.ts:91` gửi bản sao kể cả khi `archived_at` khác null ⇒ 3 file test (`bootstrap-carries-open-tables-and-the-floor`, `floor-tables-that-held-orders-are-archived`, `floor-plan-areas-and-tables`) xanh. Máy quầy đọc sơ đồ từ feed (đợt sau) sẽ giữ khu đã xóa.
- Sửa: lưu trữ khu ⇒ kéo feed ⇒ `floor_area` của khu đó là `null` (bàn tương tự đã có test).

## Đã soát, không thấy lỗi
- Cấu hình server (`server-config.ts`): zod, `FNB_ENV` bắt buộc; production từ chối HĐĐT giả, cookie không Secure, thiếu `FNB_ALLOWED_ORIGINS`; câu lỗi không chứa giá trị (errorMap thay "received '…'"); chuỗi rỗng coi như không đặt. `main.ts` chỉ in địa chỉ/môi trường/nhà cung cấp; lỗi khởi động in `error.message` của pg (không chứa mật khẩu).
- `refusePrivilegedRole`: từ chối SUPERUSER/BYPASSRLS. (Không kiểm thành viên của role khác — NOINHERIT vẫn cho `SET ROLE`; chỉ là phòng thủ chiều sâu, provisioning không tạo membership nào.)
- Provisioning: mọi tên role/DB qua `escapeIdentifier`, mật khẩu qua `escapeLiteral`, CLI còn regex tên `^[a-z_][a-z0-9_]{0,62}$` ⇒ không injection; role đã có bị đặt lại thuộc tính an toàn; khóa advisory cho phần tạo role/DB; `REVOKE TEMPORARY`, default privileges REVOKE EXECUTE FROM PUBLIC. CLI không in mật khẩu (in URL với chữ PASSWORD).
- Kiểm Origin: chỉ bỏ qua GET/HEAD/OPTIONS; không có route GET nào ghi dữ liệu nghiệp vụ; `Origin: null` (iframe sandbox, Referrer-Policy no-referrer) bị chặn vì không nằm trong danh sách; thiếu Origin cho qua (webhook, máy quầy native) — đúng mô tả; dev stack bật danh sách cho cả 127.0.0.1 và localhost.
- Cookie: `__Host-` + Secure + HttpOnly + SameSite=Lax khi secure; tên khác khi insecure (không đọc lẫn). Không có CORS plugin ⇒ trang lạ không đọc được câu trả lời.
- Dev stack: `credentials.json` tạo với mode 0600 (chỉ khi tạo mới); Postgres nhúng chỉ nghe 127.0.0.1, không unix socket, scram-sha-256; `tmp/` trong `.gitignore`; mật khẩu/PIN in ra là giá trị ngẫu nhiên của máy.

- Giờ lệnh: `readCommandTime` là chỗ duy nhất quyết; mọi handler dùng `time.effectiveAt/businessDate` (save_draft giá + hết món, pay/refund `paid_at`, HĐĐT `sold_at`, mở ca `business_date`, duyệt tại chỗ); hạn QR = `receivedAt` + 15′; `createdAt` phải có offset (zod `datetime({offset:true})`). `now()` của DB chỉ còn ở `updated_at`, `matched_at`, `closed_at` của ca — không cột nào trong số đó quyết định nghiệp vụ. POS lọc lịch sử theo ngày kinh doanh của chi nhánh; backoffice dùng đồng hồ mặc định 04:00/UTC+7 (khớp mọi chi nhánh hiện có vì không route nào đổi `business_day_start_minute`).
- Chốt ngày: cho chốt "hôm nay" (đúng cho quán đóng cửa trước 04:00); chặn khi còn ca/nháp/HĐĐT chờ của ngày; đơn trả sau chốt (cả hoàn tiền: hoàn được chèn `draft` rồi mới `paid` nên trigger `paid_after_day_close` chạy) bị đánh dấu.
- Bàn: `expectedVersion` kiểm trên dòng đã khóa FOR UPDATE; một nháp/bàn bằng unique index + bắt 23505 trong savepoint; chuyển bàn chỉ sang bàn trống, giữ "tạm tính còn đúng" khi chỉ đổi bàn; occupancy/bootstrap/feed đều lọc chi nhánh của máy; snapshot trả kèm lời từ chối lọc chi nhánh (`subjectSnapshotOf`); bàn không chuyển được sang khu của chi nhánh khác.
- Duyệt: đúng người xin + đúng máy + đúng khóa/giá trị + một lần (savepoint trả lại khi lệnh bị từ chối); người duyệt phải `active`, cùng chi nhánh, đúng PIN, không tự duyệt; lần thử PIN tính trước khi kiểm quyền.
- Nhân viên: mọi route cần `manage_staff`, khóa dòng staff, ghi audit; khóa ⇒ thu hồi phiên + feed `staff_member = null`; `findCurrentStaffSession` kiểm `active` + chi nhánh ở mọi request; lưu trữ vai trò khóa role FOR UPDATE, gán vai trò khóa FOR SHARE ⇒ không lọt (trừ X9 là đăng nhập PIN).
- refundDue: cần `view_reports` + `manage_settings`, khóa dòng intent, trigger cấm sửa sau khi đánh dấu, chỉ tiền "không đơn nào tính" (không đánh dấu được QR đúng tiền của đơn còn mở).
- HĐĐT: lookup trước khi gửi lại; câu trả lời muộn vào audit; hạn gọi < lease (nhưng xem T6); chốt ngày chặn `failed_retryable`.
- Backoffice (9b+): mọi route có `requireSession` + khóa quyền phù hợp (settings/floor ghi/einvoice/webhook secret: `manage_settings`; báo cáo/chốt ngày: `view_reports` (+`accept_close_difference`); nhân viên/vai trò: `manage_staff`; thiết bị: `manage_devices`); tenant chỉ từ phiên + RLS; không route nào trả bí mật webhook (chỉ ghi, niêm phong AES-GCM); `einvoice_profile`/`payment_account` không chứa bí mật; backoffice Next không có route server/server action, chỉ rewrite `/api`; danh sách nhân viên/thiết bị không trả PIN hash/token.

## Đột biến
52 đột biến (M1–M52) trên vùng 1–5, mỗi cái chạy 1–3 file test liên quan; baseline của mọi file đã xanh trước khi đột biến (00:39, 00:45). `git status --porcelain` sạch sau mỗi lô.
- Sống (10): M1, M2 (T3), M5 (tương đương: không thông điệp mặc định nào của zod chứa giá trị ⇒ `withoutValues` là phòng thủ chưa từng chạy), M6 (T2), M18 (T1), M22 (T4), M34 (T5), M41 (T7), M45 (T6), M52 (tương đương: `UPDATE … WHERE refunded_at IS NULL` vẫn trả 409).
- Bị giết (42): M3, M4, M7–M17, M19–M21, M23–M33, M35–M40, M42–M44, M46–M51. Danh sách + thời gian: `tmp/review/mutation/results.txt`; định nghĩa: `mutate.py` (M1–M34), `batch2.py` (M35–M52).

## Câu hỏi mở
- X5/X6 + D-040: approval cho `accept_close_difference` (và `void_after_sent`, `refund`, `transfer_table`) không mang giá trị nào — có nên ghi số tiền/đối tượng vào approval để "khớp đúng" như giảm giá/thu chi không? Với thu/chi: khớp đúng hay `≥` (X6 cho thấy khớp đúng + số ước lượng của máy ⇒ từ chối sau khi đã chi)?
- X3: biên +2′ dùng để tha thứ lệch giờ nhỏ hay để "kẹp về giờ nhận"? Nếu tha thứ thì effectiveAt nên là giờ máy trong biên.
- X4: hoàn tiền QR sau khi chốt ngày nên rơi vào ngày đó (đánh dấu sau chốt) hay ngày mở kế tiếp?
- `order.cancel` không cần quyền nào (kể cả khi đã in tạm tính, chưa gửi bếp) — Backlog đã có "hủy đơn đang gắn bàn có cần `close_unpaid_table`?" (chờ quyết); khóa `close_unpaid_table` hiện không được dùng ở đâu. Ghi lại vì với món không qua bếp (không trạm) "in tạm tính → thu tiền → hủy đơn" không cần ai duyệt.
- "Đổi nhân viên"/"Đăng xuất" trên POS (đợt 9d) không chờ hàng đợi lệnh: lệnh offline của A được đẩy bằng phiên của B (người tạo = B, approval A xin bị `SYNC_APPROVAL_NOT_FOR_THIS_STAFF`). Gốc đã có trong Backlog ("cần tôn trọng staffSessionId theo từng lệnh"); đợt 9d làm đường này thành thao tác hằng ngày.

## Cách tái hiện
Probe (Postgres nhúng của repo qua global setup của `apps/api`, dữ liệu trong `tmp/review/probes/tmp`, tự dừng + xóa khi xong; thư mục module của probe là symlink tới thư mục module của `apps/api`):
```
cd /home/datadevice/FileMySelf/FNB-POS/worktrees/review3/tmp/review/probes
TMPDIR=$PWD/tmp npx --no-install vitest run --config vitest.probe.config.ts            # tất cả (~4 s mỗi file)
TMPDIR=$PWD/tmp npx --no-install vitest run --config vitest.probe.config.ts tables     # một file
```
- `tables.probe.test.ts` — X2; `day-close.probe.test.ts` — X4; `shift-close.probe.test.ts` — X5 + X6; `clock-boundary.probe.test.ts` — X3; `staff-lock.probe.test.ts` — X9.

Đột biến: `cd review3 && python3 -I tmp/review/mutation/mutate.py [M1 M18 …]` (và `batch2.py`) — mỗi đột biến chạy đúng file test liên quan với `--maxWorkers=1`, hoàn nguyên bằng `git checkout -- <file>`; kết quả nối vào `tmp/review/mutation/results.txt`.
