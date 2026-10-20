# Review đợt 3–7 — fnb-pos @ b386606

Bản sao: `/home/datadevice/FileMySelf/FNB-POS/worktrees/review2` (chỉ đọc). Ngày: 2026-10-20.
Đã đọc trước: `docs/research/review-wave-1-2-findings.md` (không báo lại A1–C5).
Đã biết, không báo lại: thiếu GET /branches|/devices|/staff; /auth/me thiếu quyền; chuyển đổi tài liệu món viết 2 lần; chưa có route ghi cấu hình; adapter HĐĐT thật chưa có; PayOS cần đối chiếu sandbox; mục "chờ user" trong Backlog.

## Tiến độ
- [x] 1. Thanh toán (payments + webhooks) — W3, W4, W7, W8 (+ W1 tiền mặt hoàn)
- [x] 2. Lệnh đồng bộ (sync) — W1, W2, W5, W6, W11
- [x] 3. HĐĐT + chốt ngày + báo cáo — W9, W13, T1, T2
- [x] 4. Feed + bootstrap — không thấy lỗi lộ dữ liệu (xem "Đã soát"); W6 là lộ gián tiếp
- [x] 5. Migration 0013–0020 — không thấy lỗi
- [x] 6. Client — W10 (POS), W11 (luật version), W12 (backoffice)
- [x] 7. Test giả — T1–T5 (24 đột biến, 6 sống)
- [x] Kiểm bản sửa đợt 1–2 — đều đã sửa; A1 còn phần dư, B2 có đường vòng W2

## Tóm tắt theo mức
- high: W1 (hoàn tiền mặt không vào ca ⇒ két luôn lệch), W2 (void sau giảm toàn đơn vượt mức duyệt), W3 (QR đã nhận tiền bị bỏ qua khi đơn trả tiền mặt/hủy ⇒ khách trả 2 lần, không ai thấy)
- medium: W4 (hạn QR theo giờ máy), W5 (`createdAt` của máy không bị kẹp: approval để dành được, giá khung giờ, giờ hóa đơn), W9 (worker HĐĐT: không timeout < lease, vứt câu trả lời "đã phát hành", không dùng `lookup`), W10 (nút chuyển khoản POS luôn lỗi), W11 (snapshot ca đổi số mà không đổi version), W12 (open redirect sau đăng nhập), T1, T2
- low: W6 (command id theo tenant), W7 (bí mật webhook trùng giữa chi nhánh / dòng hỏng chặn cả tenant), W8 (tái dùng mã QR nhặt tiền cũ), W13 (chốt ngày bỏ qua nháp mở), T3–T5

Phạm vi đã đọc: `apps/api/src/{payments,routes/webhooks,routes/payments,sync,einvoice,day-close,reports,routes/reports,routes/pos}`, migrations 0013–0020 (+0010), `packages/sync-client/src/{local-store,sync}` (phần push/pull/version), `apps/pos/src/features/{payment,shift,order/till-command}`, `apps/backoffice/src/lib/{navigation,errors}`. Bỏ qua/đọc lướt: `apps/api/src/catalog/*` và routes catalog/floor/roles/staff (ngoài phạm vi ưu tiên), UI POS/backoffice ngoài các file trên, `packages/sync-client/src/browser/*`, e2e.

## Phát hiện

Probe tích hợp: `review-notes/probes/wave37.probe.test.ts` (chạy bằng `probes/vitest.probe.config.ts`, Postgres nhúng của repo, TMPDIR trong `probes/tmp`). Mỗi test XANH = lỗi có thật. Kết quả 8/8 xanh lúc 11:55.

### A. Thanh toán / tiền mặt

#### W1 · high · `apps/api/src/sync/refund-order-command.ts:64-70` — tiền hoàn bằng tiền mặt không thuộc ca nào ⇒ két luôn "thiếu" đúng số tiền đã hoàn
- Lỗi: `order.refund` chèn `payment` mà không có `shift_id` (cũng không có `recorded_after_shift_close`). `readShiftCashBook` (`stored-shift.ts:111-113`) chỉ đọc `payment WHERE shift_id = $1`, dù code đã viết sẵn nhánh `cash_refund` cho số âm. Payload hoàn cũng không có `shiftId`. Không test nào hoàn tiền mặt trong ca.
- Kịch bản (đã chạy, P1): mở ca 200.000 → bán 1 cà phê 29.000 tiền mặt → hoàn 1 ly −29.000 tiền mặt → đếm két 200.000 (đúng thực tế) → server đóng ca với `expectedCash = 229.000, difference = −29.000`; dòng payout `shift_id = null`. Mỗi lần hoàn tiền mặt là một khoản "thiếu két" không giải thích được; với ngưỡng mặc định 0 đ thì thu ngân phải xin duyệt chênh lệch ở mọi ca có hoàn. Ngược lại, quản lý quen "duyệt chênh lệch" thì che luôn thiếu két thật.
- Sửa: trong `refundOrder` gọi `shiftForPayment(context, payload.shiftId)` như `order.pay`, ghi `shift_id`/`recorded_after_shift_close` cho từng payout, `announceLatePayment`; thêm `shiftId?` vào `refundOrderPayloadSchema`. Test: hoàn tiền mặt trong ca ⇒ `figures.cashRefunds = 29.000`, `expectedCash = 200.000`, chênh 0; hoàn sau khi ca đóng ⇒ vào `recordedAfterClose`.
- Xác nhận: probe P1.

#### W2 · high · `apps/api/src/sync/void-line-command.ts:25-76` — hủy món sau khi đã có giảm giá toàn đơn làm tỉ lệ giảm vượt mức được duyệt, không ai duyệt lại
- Lỗi: giảm % toàn đơn được lưu thành số tiền cố định. `save_draft` có `refuseRaisedOrderDiscount` (giảm số lượng làm tỉ lệ tăng ⇒ từ chối), nhưng `order.void_line` không gọi kiểm tra nào: hủy món chưa gửi bếp không cần ai, tỉ lệ giảm tăng tự do. Đây là đường vòng của chính bản sửa B2.
- Kịch bản (đã chạy, P2): thu ngân (không có quyền `order_discount`) xin quản lý duyệt giảm 10% cho đơn 4 cà phê (116.000 ⇒ giảm 11.600). Đổi nháp xuống 1 ly qua `save_draft` ⇒ `SYNC_DISCOUNT_RATE_RAISED` (đúng). Nhưng `order.void_line` 3 ly ⇒ `accepted`, rồi `order.pay` 17.400 ⇒ `accepted`: khách trả 17.400 cho ly 29.000 (giảm 40%) trong khi quản lý chỉ duyệt 10%.
- Sửa: gọi `refuseRaisedOrderDiscount(context, stored.order.lines, order.lines)` trong `voidOrderLine` trước khi ghi (hoặc đưa kiểm "tỉ lệ giảm toàn đơn không được tăng quá mức người gửi tự làm được" vào một chỗ dùng chung cho mọi lệnh đổi dòng: save_draft, void_line, remove_discount…). Test: kịch bản trên phải bị từ chối; hủy khi tỉ lệ mới vẫn trong mức ⇒ nhận.
- Xác nhận: probe P2.

#### W3 · high · `apps/api/src/payments/qr-transfer-tenders.ts:20-63` + `sync/pay-order-command.ts:29-60` + `sync/cancel-order-command.ts:15-38` + `payments/match-transfer-by-hand.ts:54-71` — QR mà ngân hàng ĐÃ báo tiền bị bỏ qua khi đơn đóng bằng cách khác ⇒ khách trả 2 lần, không ai thấy
- Lỗi: `withdrawPendingIntents` chỉ gỡ intent `pending`; `assertQrTransfersArePaid` chỉ kiểm intent mà tender nhắc tới. Không chỗ nào kiểm "đơn này còn intent `paid/partial/overpaid` chưa được dùng". Màn khớp tay chỉ liệt kê giao dịch CHƯA ai nhận và intent `pending/expired`, nên tiền đã khớp vào intent của đơn trả bằng tiền mặt/đơn đã hủy biến mất khỏi mọi danh sách. Thêm: khớp tay được vào intent `expired` của đơn đã trả/đã hủy (`matchTransferByHand` không đọc trạng thái đơn) ⇒ cũng thành "paid" mồ côi.
- Kịch bản (đã chạy, P3): QR 39.000 → webhook báo 39.000 đúng mã ⇒ intent `paid` → máy quầy (offline/chưa kéo feed nên vẫn thấy "chờ") thu tiền mặt `order.pay` cash 39.000 ⇒ `accepted`; intent vẫn `paid`; `GET /payments/unmatched` không có giao dịch, không có intent đó. Tương tự `order.cancel` sau khi QR đã trả ⇒ `accepted` (P3b). Khách mất 39.000 (hoặc tiền vào quán mà không thuộc đơn nào), báo cáo/két không lệch nên không ai phát hiện.
- Sửa: (1) `order.pay`: nếu đơn có intent đã settle mà tender không dùng ⇒ từ chối mã mới (vd `SYNC_ORDER_HAS_SETTLED_QR`) và trả snapshot intent cho máy; (2) `order.cancel`: từ chối khi có intent đã settle (phải hoàn/khớp trước); (3) `matchTransferByHand`: chỉ khớp vào intent của đơn còn `draft`; (4) màn khớp tay thêm mục "tiền đã khớp vào QR của đơn đóng bằng cách khác" để hoàn tiền. Test cho cả 3 đường.
- Xác nhận: probe P3 + P3b; phần khớp tay đọc code.

#### W4 · medium · `apps/api/src/payments/create-payment-intent-command.ts:57-58,76-79` — hạn QR tính bằng đồng hồ máy quầy (`command.createdAt`), trái với chú thích migration "a till's or a bank's clock cannot move"
- Lỗi: `expires_at = createdAt(máy) + 15'`; server không so `createdAt` với giờ nhận ở bất kỳ đâu. Cửa sổ tìm tiền đến trước (`lookFrom = expiresAt − 24h`) cũng trượt theo đồng hồ máy.
- Kịch bản (đã chạy, P4): máy chậm 20 phút, hiện QR, khách chuyển ngay sau 1 phút (giờ server) ⇒ intent thành `expired`, tiền nằm chờ khớp tay — mọi QR của máy đó đều hỏng tự khớp. Máy nhanh 1 ngày ⇒ `expiresAt = 2026-10-21T03:15Z`: QR cũ trên màn hình còn nhận tiền cả ngày (đúng cái chú thích nói muốn tránh). Máy sai múi giờ/ RTC tablet trôi là chuyện thường.
- Sửa: lấy mốc hiện QR = `min(createdAt, receivedAt)` và từ chối (hoặc kẹp) `createdAt` lệch quá `receivedAt` (vd > +2' tương lai); với máy offline lâu, giới hạn `receivedAt − createdAt` (vd ≤ 12h) rồi mới tin. Test: createdAt tương lai bị kẹp; createdAt chậm 20' + server nhận ngay ⇒ vẫn tự khớp.
- Xác nhận: probe P4, P4b.

#### W5 · medium · `apps/api/src/sync/approval-redemption.ts:66-67` (gốc: `sync-request-schemas.ts:24`, `createdAt` không bao giờ được so với giờ server) — hạn 10 phút của approval chỉ so với đồng hồ máy ⇒ approval giữ được vô hạn
- Lỗi: `gap = |createdAt(máy) − approval.created_at(DB)|`. Máy (hoặc payload sửa tay) ghi `createdAt` = lúc được duyệt là qua, bất kể lệnh tới server sau bao lâu. Mục backlog "approval khớp đúng giá trị / gắn với đơn (chờ user)" không phủ điểm này.
- Kịch bản (đã chạy, P5): approval `refund` có `created_at = now() − 1 ngày`; lệnh `order.refund` hôm nay mang `createdAt = giờ duyệt + 1'` ⇒ `accepted`. Thu ngân xin quản lý duyệt 1 lần, để dành, hôm sau tự hoàn tiền một đơn khác khi quản lý không có mặt.
- Cùng gốc (đọc code, chưa chạy): `createdAt` của máy còn quyết định giá theo khung giờ/ngày (`save-draft-command.ts:35-37` → `priceDraftLines(..., at)` → `resolveUnitPrice` lọc `validFrom/validTo/daysOfWeek/timeWindow`), chặn hết món (`refuseSoldOut(..., recordedAt)`), `paid_at` và `sold_at` của HĐĐT (`pay-order-command.ts:57`, `queue-einvoice.ts:60`). Máy đặt giờ về 15:00 lúc 20:00 ⇒ lưu nháp được giá happy-hour; hóa đơn ghi giờ máy sai.
- Sửa: thêm điều kiện theo giờ server: `receivedAt − approval.created_at ≤ cửa sổ offline tối đa` (vd 12h, cấu hình) và `createdAt ≥ approval.created_at − độ lệch cho phép`; nói chung nên có một kiểm chung ở `applySyncCommand`: `createdAt` không được ở tương lai quá X phút so với `receivedAt` (lệnh bị từ chối mã riêng, máy báo "sai giờ").
- Xác nhận: probe P5 (chèn approval cũ bằng role app, đúng cột route ghi).

#### W6 · low · `apps/api/src/sync/command-ledger.ts:6-15` + `0012_sync.sql:23` — khóa idempotency `command_id` là theo tenant, không theo máy
- Lỗi: `storedResultOf` tra `applied_command` chỉ theo `command_id` (RLS lọc tenant). Máy B gửi một `commandId` đã có của máy A nhận lại nguyên kết quả của A (kèm snapshot đơn của A, kể cả khi A ở chi nhánh khác), còn `device_seq` của B không tăng.
- Kịch bản (đã chạy, P6): A `save_draft` (id X); B gửi lệnh mới với `commandId = X` ⇒ nhận `accepted` + snapshot đơn của A; lệnh kế tiếp của B (seq+1) ⇒ `retry SYNC_OUT_OF_ORDER` mãi mãi (máy B kẹt hàng đợi, lệnh thật của B bị coi là đã nhận). Xảy ra khi máy sinh trùng id (bug/clone bản cài) hoặc cố ý dò.
- Sửa: tra `WHERE command_id = $1 AND device_id = $2`; nếu id đã thuộc máy khác ⇒ ghi `rejected` mã `SYNC_COMMAND_ID_TAKEN` cho seq này (để seq tiến lên), không trả snapshot của máy kia. Test hai máy cùng id.
- Xác nhận: probe P6.

#### W7 · low · `apps/api/src/payments/webhook-endpoint-store.ts:35-52` + `routes/payments/payment-backoffice-routes.ts:76-104` — một bí mật cho hai chi nhánh ⇒ tiền luôn ghi cho chi nhánh có id nhỏ hơn; một dòng hỏng chặn webhook cả tenant
- Lỗi: (a) route PUT không kiểm bí mật mới trùng bí mật chi nhánh khác của cùng gateway; `branchProvenBy` trả chi nhánh đầu tiên theo `ORDER BY branch_id`. (b) `box.open` ném lỗi (khóa đổi, dữ liệu hỏng) ⇒ cả request 500, mọi thông báo của mọi chi nhánh trong tenant bị từ chối, gateway retry vô tận.
- Kịch bản: quán 2 chi nhánh dùng chung tài khoản SePay/kênh PayOS (cùng API key/checksum key) ⇒ chuyển khoản vào QR chi nhánh 2 được ghi `branch_id` = chi nhánh 1 ⇒ `transferPaysIntent` sai chi nhánh ⇒ không bao giờ tự khớp, màn khớp tay chi nhánh 2 cũng không thấy (lọc theo branch, `branchMismatch` khi khớp tay).
- Sửa: PUT mở các bí mật khác của tenant cùng gateway, trùng ⇒ 409 mã riêng (hoặc cho phép "một endpoint nhiều chi nhánh" và khớp theo mã QR thay vì theo bí mật); trong vòng lặp bọc `open` bằng try/catch, bỏ qua + log dòng hỏng; thêm key-id vào envelope để xoay khóa.
- Xác nhận: đọc code.

#### W8 · low · `apps/api/src/payments/create-payment-intent-command.ts:48-56,76-79` — mã nội dung chỉ duy nhất trong số intent `pending`; mã cũ dùng lại "nhặt" tiền chưa khớp của QR cũ
- Lỗi: mã do máy gửi; kiểm trùng chỉ với intent `pending` (index cũng vậy). Intent mới mang mã của một intent cũ đã `expired/paid` sẽ được `unclaimedTransfers` (24h) khớp ngay với giao dịch chưa ai nhận có mã đó (chuyển trễ sau hạn, khách chuyển 2 lần) — dù là đơn khác, miễn đúng số tiền.
- Kịch bản (đã chạy, P8): QR mã M (39.000) hết hạn, khách chuyển trễ ⇒ giao dịch chờ khớp tay. Máy (bug sinh mã, hoặc payload sửa tay) tạo intent mới mã M cho đơn khác 39.000 ⇒ intent mới `paid` ngay, đơn kia trả bằng tiền của khách trước.
- Sửa: cấm tái dùng mã đã từng có trong tenant (unique toàn phần, hoặc trong N ngày), hoặc khi khớp lúc tạo chỉ nhận giao dịch có `received_at ≥ createdAt − độ lệch` của CHÍNH intent này. Test.
- Xác nhận: probe P8 (`probes/code-reuse-and-day-close.probe.test.ts`): QR cũ hết hạn nhận tiền trễ ⇒ `expired`; intent mới của ĐƠN KHÁC cùng mã ⇒ `paid` ngay lúc tạo.

### B. HĐĐT

#### W9 · medium · `apps/api/src/einvoice/einvoice-worker.ts:127-155` + `einvoice-outcomes.ts:39-45` — gọi nhà cung cấp không có timeout ngắn hơn lease; câu trả lời "đã phát hành" về muộn bị vứt im lặng; `lookup()` không bao giờ được gọi
- Lỗi: lease 120 s (`einvoice-retry-policy.ts:21`), `askProvider` không đặt timeout. Gọi chậm > 120 s ⇒ worker/instance khác claim lại (attempts+1) và gửi lần 2 cùng id. Kết quả lần 1 (kể cả `ok` với số hóa đơn) bị đánh `stale` và bỏ đi, không audit, không lưu số. Interface có `lookup` "to recover an answer that was lost" nhưng worker không dùng ở đâu (grep chỉ thấy fake). Phần này là lỗi phía worker, độc lập với câu hỏi idempotency của nhà cung cấp (đã có trong backlog).
- Kịch bản: nhà cung cấp chậm 150 s, phát hành số 0000123 cho lần 1; lần 2 (cùng id) nhà cung cấp trả lỗi "trùng chứng từ/đang xử lý" ⇒ nếu adapter map là permanent ⇒ hóa đơn `failed_permanent` dù đã có số ở nhà cung cấp; người xử lý phát hành lại ⇒ 2 hóa đơn cho 1 đơn. Nếu nhà cung cấp không idempotent ⇒ 2 số, DB giữ 1.
- Sửa: timeout cho `issue/submitDailyBatch` = lease − biên (AbortSignal truyền xuống adapter); khi outcome `stale` mà `ok` ⇒ ghi audit kèm số; trước khi gửi lại hóa đơn có `attempts > 0` thì gọi `lookup(id)` trước, thấy thì ghi `issued`. Test với fake chậm hơn lease (ManualClock + promise treo).
- Xác nhận: đọc code + grep.

### C. Đồng bộ / client

#### W10 · medium · `apps/pos/src/features/payment/pay-order-command.ts:23-31` + `screens/payment/payment-screen.tsx:96-107` — nút "Đã nhận chuyển khoản" của POS luôn thất bại; hợp đồng `order.pay` bắt `qr_transfer` phải có `paymentIntentId`
- Lỗi: POS dựng tender `{method: "qr_transfer", amount}` không bao giờ kèm `paymentIntentId`; `payOrderPayloadSchema` (`packages/contracts/.../pay-order-payload-schema.ts:15-20`) refine `qr_transfer ⇔ paymentIntentId` ⇒ `tillCommand` ném `InvalidPayloadError`, màn hình chỉ hiện "thất bại" chung. Không test POS/e2e nào đi đường chuyển khoản.
- Kịch bản (đã chạy, U1): đơn 39.000, thu ngân bấm "Đã nhận chuyển khoản 39.000" → "Hoàn tất" ⇒ lỗi. Ở quầy thật thu ngân sẽ bảo khách trả tiền mặt dù khách đã chuyển ⇒ khách trả 2 lần, tiền chuyển nằm "chưa khớp".
- Sửa: hoặc ẩn nút cho tới khi màn QR có intent (gửi `payment.create_intent`, chờ `paid`, rồi tender mang `paymentIntentId`), hoặc nếu muốn "thu ngân tự xác nhận" thì phải là method khác (`bank_transfer_manual`) có quyền/ghi audit — không dùng `qr_transfer`. Test component: bấm chuyển khoản + hoàn tất ⇒ lệnh hợp lệ vào outbox.
- Xác nhận: probe U1 (`probes/pos-transfer.unit-probe.test.ts`, payload y hệt code POS ⇒ schema từ chối, `tillCommand` ném).

#### W11 · medium · `apps/api/src/sync/shift-snapshot.ts:66` + `cash-move-command.ts` + `payment-shift.ts:44-56` — snapshot ca đổi số liệu mà KHÔNG đổi version ⇒ máy quầy (luật "chỉ nhận bản mới hơn hẳn") bỏ qua
- Lỗi: version của snapshot = `shift.version`, chỉ tăng khi mở/đóng. Thu/chi (`shift.cash_move`) không chạm hàng `shift`; tiền về sau khi đóng ca thì hàng `shift` bị trigger cấm sửa nên `announceLatePayment` gửi lại snapshot cùng version với lúc đóng. `UPSERT_SERVER_SQL` của sync-client chỉ thay khi `excluded.version > version` ⇒ bản mới bị vứt; `order.pay` vào ca thì không phát snapshot ca nào.
- Kịch bản (đã chạy, P7): mở ca 200.000 (v1, expected 200.000) → chi 100.000 ⇒ kết quả lệnh: v1, expected 100.000 ⇒ máy giữ bản cũ 200.000. P7b: đóng ca v2 → tiền mặt đến trễ 29.000 ⇒ feed gửi lại ca v2 với `cashRecordedAfterClose = 29.000` ⇒ máy đã có v2 nên không bao giờ thấy khoản điều chỉnh (đúng thứ `announceLatePayment` sinh ra để báo). Test `late-offline-order-keeps-its-shift.test.ts:92-103` chỉ kiểm feed thô nên xanh.
- Sửa: dùng version kiểu feed cho ca (như `appendSequencedChange`: version = change_seq) hoặc thêm cột `book_version` tăng ở mỗi payment/cash_move (trigger AFTER INSERT trên `cash_move`/`payment` có `shift_id`, kể cả khi ca đã đóng — cột riêng không thuộc "nội dung đã chốt"). Test qua sync-client thật: máy kéo feed ⇒ thấy số mới.
- Xác nhận: probe P7, P7b (`probes/shift-version.probe.test.ts`) + đọc `local-store-schema-sql.ts:69-73`.

#### W12 · medium · `apps/backoffice/src/lib/navigation/safe-return-path.ts:6-11` — chuyển hướng sau đăng nhập lọt ra ngoài bằng ký tự tab/xuống dòng
- Lỗi: chỉ chặn `//` và `/\`. Trình phân tích URL (WHATWG) xóa mọi tab/CR/LF trong chuỗi, nên `"/\t/evil.example"` qua bộ lọc rồi thành `//evil.example`. `router.replace` của Next 15.5 dựng `new URL(href, location.href)`, thấy khác origin ⇒ `location.replace` sang trang ngoài.
- Kịch bản (đã chạy bằng node, đúng phép dựng URL của Next `app-router-instance.js:206`): `https://bo.fnb.vn/login?next=%2F%09%2Fevil.example%2Fphish` → chủ quán đăng nhập đúng → bị đưa sang `https://evil.example/phish` (trang giả "phiên hết hạn, nhập lại mật khẩu"). Tương tự `%0A`, `%0D%0A`.
- Sửa: `const url = new URL(next, location.origin); if (url.origin !== location.origin) return "/"; return url.pathname + url.search + url.hash;` (hoặc từ chối mọi ký tự < 0x20 và `\`). Thêm `"/\t/evil.example"`, `"/\n/evil.example"` vào `safe-return-path.test.ts`.
- Xác nhận: node one-liner chạy chính hàm (sao chép nguyên văn) + `new URL` ⇒ `https://evil.example/x`; đọc `navigate-reducer.js:164` (handleExternalUrl).

#### W13 · low · `apps/api/src/day-close/close-business-day.ts:69-75` + `day-status.ts` — chốt ngày không nhìn nháp còn mở của ngày đó; server cũng không đánh dấu đơn trả vào ngày đã chốt
- Lỗi: điều kiện chặn chỉ là ca chưa đóng (theo `shift.business_date` máy gửi) và hóa đơn chưa phát hành. Nháp mở (bàn chưa trả) mang `business_date` = D vẫn được trả sau khi D đã chốt; `order.pay` không kiểm `day_close`. Khác mục backlog "bán của ngày đã chốt đồng bộ muộn" ở chỗ đây là trường hợp online bình thường, và người chốt không được cảnh báo.
- Kịch bản (đã chạy, P9): 23:50 bàn 5 còn nháp (business_date D); quản lý đóng ca rồi chốt ngày D ⇒ 201. 00:10 khách trả ⇒ đơn vào ngày D đã chốt: báo cáo D đọc lại khác `day_close.summary`, hóa đơn ngày D không có batch.
- Sửa: `DayStatus` thêm `openDrafts` (chặn chốt hoặc ít nhất cảnh báo + cần xác nhận); `order.pay` của đơn thuộc ngày đã chốt ⇒ gắn cờ/đổi business_date theo luật user chọn (ghi vào decision-log).
- Xác nhận: probe P9: nháp mở → `POST /branches/:id/day-close` 201 (summary 0 đơn) → `order.pay` accepted → `/reports/daily-sales` ngày đó 1 đơn.

### D. Test giả / test hở (mutation trên bản sao `probes/tmp/api-copy`, node_modules symlink, chỉ chạy thư mục test liên quan; script `probes/mutate-api-copy.py`, kết quả `probes/tmp/mutation-results.txt`)

24 đột biến trên code đợt 3–7, 18 bị bắt. Sống sót:

#### T1 · medium · `apps/api/test/integration/einvoice/*` — không test nào cho câu trả lời "stale" (lease hết hạn rồi worker khác claim)
- Đột biến M5: bỏ `|| current.attempts !== claimed.attempts` ở `einvoice-outcomes.ts:45` ⇒ 45/45 xanh. M20: bỏ điều kiện tương tự ở `einvoice-batch-work.ts:107` ⇒ 53/53 xanh. Đây chính là chốt chặn "hai worker cùng gửi" (xem W9); gỡ ra không ai biết.
- Sửa: test với ManualClock: claim lần 1, tiến đồng hồ qua lease, claim lần 2, ghi kết quả lần 1 ⇒ `stale`, trạng thái theo lần 2.

#### T2 · medium · `apps/api/test/integration/day-close/end-of-day-close.test.ts` — chốt ngày khi còn hóa đơn `failed_retryable` không được test
- Đột biến M13: `day-status.ts` chỉ coi `pending` là chưa phát hành (bỏ `failed_retryable`) ⇒ 8/8 xanh. Hệ quả nếu lỡ sửa: nhà cung cấp đang lỗi tạm ⇒ ngày vẫn chốt, batch tạo thiếu hóa đơn đó, hóa đơn phát hành sau không bao giờ vào batch (giống ca "bán muộn" trong backlog).
- Sửa: thêm ca fake provider trả lỗi tạm ⇒ `POST day-close` 409 `invoicesUnissued` liệt kê hóa đơn `failed_retryable`.

#### T3 · low · `apps/api/test/integration/payments/*` — QR của chi nhánh khác bị "hết hạn" bởi tiền vào tài khoản chi nhánh này
- Đột biến M8: bỏ `intent.branchId === transfer.branchId &&` ở nhánh expire (`record-reported-transfer.ts:103-106`) ⇒ 68/68 xanh. Thiệt hại thấp (QR đó đã quá hạn), nhưng điều kiện không được giữ.

#### T4 · low · `apps/api/test/integration/shift/late-offline-order-keeps-its-shift.test.ts:92-103` — test xanh trong khi máy quầy không bao giờ thấy khoản điều chỉnh
- Test chỉ đọc feed thô (`pullAll`) và thấy snapshot ca có `cashRecordedAfterClose`; không đi qua sync-client nên không thấy snapshot đó cùng version với bản đã có và bị bỏ (W11). Sửa: kiểm qua `ScenarioTill`/local store.

#### T5 · low · ghi chú
- M19 (bỏ `AND batch_id IS NULL` ở `queue-daily-batches.ts`) sống: hiện chỉ gọi 1 lần/ngày nên chưa với tới; sẽ thành gửi trùng ngay khi có "batch bổ sung" (mục backlog) ⇒ viết test cùng lúc với tính năng đó.
- M12 (bỏ `'posted'` khỏi báo cáo) sống nhưng vô hại: không đường code nào tạo đơn `posted`.
- Không có test POS/e2e cho nút chuyển khoản (W10), cho hoàn tiền mặt trong ca (W1), cho void sau giảm toàn đơn (W2), cho QR đã trả rồi trả tiền mặt/hủy (W3).

## Đã soát, không thấy lỗi
- Chữ ký webhook: so sánh qua SHA-256 + `timingSafeEqual` (độ dài không lộ); verify chạy TRƯỚC parse; tenantRoute chỉ là "lời khai", sai/không có ⇒ cùng 401; RLS theo tenant của path nên bí mật tenant khác không bao giờ được thử; PayOS ký `data` (top-level `code` không ký nhưng chỉ có thể làm thông báo thành "không có giao dịch").
- Hộp bí mật: AES-256-GCM, IV 12 byte ngẫu nhiên mỗi lần, tag cố định 16 byte, AAD = tenant/branch/gateway (dán sang dòng khác không mở được), khóa 32 byte từ env.
- Khớp giao dịch: `bank_transaction` unique (tenant, gateway, reference) + chỉ-thêm; `payment_intent_one_per_transaction`, `payment_one_per_intent`, một QR sống/đơn, mã sống duy nhất/tenant; mọi ghi đều sau `lockTenantChangeFeed` nên webhook × order.pay × cancel × khớp tay tuần tự; tender QR phải đúng intent của đơn, cùng chi nhánh, `paid`, đúng số tiền; thiếu/thừa không tự đóng đơn.
- Lệnh đồng bộ: mọi lệnh kiểm chi nhánh của đơn/ca/trạm/bàn; dòng chỉ sửa được khi nháp (cộng trigger DB); approval: đúng người xin + đúng máy + đúng khóa + đúng giá trị + dùng một lần (`approval_use_once`, ghi trong savepoint nên lệnh bị từ chối trả lại approval); giảm giá xét tỉ lệ tích lũy (làm tròn lên); thu/chi xét tổng theo người trong ca; bếp không ghi vượt (contract cấm trùng dòng, server so với lượng nợ); hoàn tiền dựng lại bằng `buildRefund` dưới khóa đơn bán.
- HĐĐT: claim bằng `FOR UPDATE SKIP LOCKED` + lease, outcome chỉ ghi khi `attempts` còn khớp; một hóa đơn/đơn; số hóa đơn unique; hóa đơn đã phát hành bất biến (trigger); `fnb_jobs.queued_work` không cho role app đọc, chỉ qua hàm SECURITY DEFINER trả tenant id.
- Migration 0013–0020: mọi bảng mới trong `public` có ENABLE + FORCE RLS + 1 policy USING = WITH CHECK; FK kép `(tenant_id, …)` (trừ chỗ cố ý không FK vào bảng chỉ-thêm, có chú thích); bảng chỉ-thêm có REVOKE + trigger STATEMENT; không sequence mới ngoài `change_log`; hàm SECURITY DEFINER có `search_path` cố định.
- Feed/bootstrap: feed lọc `branch_id`, giá theo chi nhánh lọc item của chi nhánh khác, bootstrap không lộ PIN/khóa (cột liệt kê từng cái + contract strict ở POS); cursor so bằng bigint, client từ chối cursor lùi/thay đổi cũ.
- Báo cáo: mọi số đi qua `soldOrderOf`/`computeOrderTotals`, hoàn tiền tách riêng theo ngày hoàn.

## Kiểm bản sửa đợt 1–2

- A1 · sửa phần lớn: khóa PIN leo thang (5'→×2→24h, `attempt-lockout.ts:17-43`) + audit `staff.pin_locked` có device. Còn lại (đúng mục "Thêm" của A1): PIN đúng (đăng nhập ca HOẶC duyệt tại quầy) vẫn xóa cả chuỗi leo thang (`pin-attempt-gate.ts:99-109`) ⇒ mỗi lần quản lý nhập PIN đúng, kẻ đoán lại có 5 lượt ở mức khóa 5'. Ước tính: quản lý nhập PIN ~10 lần/ngày ⇒ ~50 lượt đoán/ngày + chuỗi khóa ⇒ vét 50% PIN 4 số trong vài tháng thay vì vài ngày. Chấp nhận được nếu user đồng ý; nếu không: chỉ reset về mức khóa trước đó chứ không về 0, hoặc reset theo thời gian.
- A2 · đã sửa: `record_login_success(p_claimed_attempts)` (`0010…sql:87-95`) và `clearPinAttempts(…, claimedAttempts)` chỉ reset khi bộ đếm còn bằng số đã claim.
- A3 · đã sửa trong migration: `0010…sql:98-102` `REVOKE EXECUTE … FROM PUBLIC` + default privileges; có test `sign-in-functions-are-closed-by-the-migrations-alone`. `fnb_jobs` (0019:171) cũng REVOKE.
- A4 · đã sửa: trigger tách INSERT/DELETE và UPDATE có `WHEN … IS DISTINCT FROM` (`0010…sql`), test `saving-an-unchanged-row-keeps-the-sign-in-indexes`.
- A5 · đã sửa: `uuidJsonSchema` pattern chữ thường (`http/uuid-schema.ts`), `uuidSchema` của contracts cũng chữ thường; không còn `format: "uuid"`.
- B1 · đã sửa theo hướng "lệnh ý định": `order.void_line` gọi `voidLine` trên đơn server giữ, `order.refund` gọi `buildRefund` + lưu `refund_line_amount`; máy không gửi dòng đảo nữa.
- B2 · đã sửa (`projectedDiscountRate`, `cumulativeCashMovedBy`), nhưng có đường vòng: W2 (void sau giảm toàn đơn).
- B3, C2, C4, C3, C5 · đã sửa, có test (`quantity.test.ts:46`, `tax-and-service-charge-rounding.test.ts`, `authorize-rejects-invalid-input.test.ts:16-21`, `current-staff-session.ts:35-41` kiểm `active` + `staff_branch`, `login-checks-one-hash-for-every-attempt`).
- C1 · đã có `parallel-login-attempts-are-counted-exactly`, `parallel-pin-attempts-are-counted-exactly`.
- B4, B6 · có `role-representation.ts` (encode/decode grants) và `buildLineDiscount` + `wholeParentLine`; không soát sâu.

## Câu hỏi mở (cần user chốt)
- W3: đơn đã có QR được ngân hàng báo tiền mà thu ngân vẫn thu tiền mặt/hủy — chặn cứng hay cho qua kèm danh sách "cần hoàn tiền"?
- W5/W4: độ lệch giờ máy tối đa chấp nhận (vd 2' tương lai) và thời gian offline tối đa còn tin `createdAt` (vd 12h)?
- W10: "thu ngân tự xác nhận chuyển khoản" (không có intent) có được phép không? Nếu có thì cần method riêng + quyền.
- W7: một tài khoản SePay/PayOS dùng chung nhiều chi nhánh có phải cấu hình hợp lệ không?

## Cách tái hiện
Tất cả ngoài repo, trong `/home/datadevice/FileMySelf/FNB-POS/worktrees/review-notes/probes/` (thư mục `node_modules` là symlink tới thư viện của `review2/apps/api`, TMPDIR = `probes/tmp`, Postgres nhúng tự dừng + xóa dữ liệu khi xong):
- `TMPDIR=$PWD/tmp ./node_modules/.bin/vitest run --config vitest.probe.config.ts` — P1–P9 (3 file `*.probe.test.ts`, 6–11 s mỗi file).
- `TMPDIR=$PWD/tmp ./node_modules/.bin/vitest run --config vitest.unit-probe.config.ts` — U1.
- `python3 -I mutate-api-copy.py [M5 M13 ...]` — đột biến trên `tmp/api-copy` (bản sao `apps/api/src` + `test`); kết quả lần chạy này ở `tmp/mutation-results.txt`.
