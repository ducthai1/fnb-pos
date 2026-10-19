# Phase 04 — Bán tại quầy: offline-first, đồng bộ, in ấn, ca & két, hủy/hoàn

## Context links
- [catalog §5 đơn, §8 thanh toán, §9 hủy/hoàn, §10 ca, §11 in, §20 offline](logic-catalog-flows-rules-and-design-decisions.md)
- [architecture §5 đồng bộ, §6 in](architecture-and-stack-decision.md)
- [research D4 offline, D5 in](research/research-d-hoa-don-dien-tu-vietqr-giao-hang-offline-in-an.md) · [research F5 phiên & két, F10 đồng bộ](research/research-f-odoo-pos-18-luat-chinh-xac-tu-ma-nguon.md)

## Overview
- Ưu tiên: P0 — trái tim của R1. Phụ thuộc: 01, 02, 03, spike S1 + S2. Ước lượng: 6–8 tuần-người.
- Phạm vi: chế độ **quầy** (cafe/trà sữa/tiệm bánh): gọi món → trả tiền → in bill + tem ly + phiếu pha chế; phiếu pha chế theo trạm (`kitchen_ticket`) làm luôn ở đây vì bàn cần dùng lại. Bàn cơ bản ở phase 04b; bàn nâng cao ở phase 06.
- Task chi tiết: [T04-01…18](tasks-r1-detailed-task-board.md).

## Key insights
- Toast/Loyverse offline: bán được đơn mới + thẻ; không sửa menu/giá, không loyalty, không chốt ca.
- Odoo chặn đóng ca khi còn đơn mở và gắn đơn offline đến muộn sang ca đang mở ⇒ cả hai là lỗi, tránh.
- Odoo cập nhật "đã gửi bếp" kể cả khi in lỗi ⇒ bếp mất phiếu. Ở đây `print_job` có trạng thái.

## Requirements
- Functional:
  - Màn bán: lưới món (ảnh/không ảnh), tìm nhanh, chọn biến thể/tùy chọn, ghi chú, sửa số lượng, giữ đơn, nhiều đơn song song.
  - Số gọi món (`call_number`); in bill, **tem dán ly** (một tem mỗi ly, có topping), phiếu pha chế theo trạm.
  - Thanh toán: tiền mặt (gợi ý mệnh giá, tiền thừa), QR VietQR động (xác nhận tay ở phase này), thẻ (máy POS rời: ghi nhận tay), nhiều phương thức trong một đơn.
  - Giảm giá tay dòng/đơn (theo quyền + ngưỡng), giá nhập tay, món theo cân.
  - Hủy dòng chưa gửi; hủy dòng đã gửi = `line_void` có lý do + duyệt theo cấu hình; hoàn đơn đã trả = đơn hoàn dòng âm, cờ `restock`.
  - Ca: mở (đếm tiền đầu theo mệnh giá), thu/chi ngoài bán hàng, đóng (đếm, chênh lệch, ngưỡng, duyệt), chuyển đơn đang mở sang ca sau, in phiếu chốt ca.
  - Offline: bán, in, tiền mặt, QR (xác nhận tay) vẫn chạy; khóa sửa menu, chốt ca, hoàn tiền; badge "chưa đồng bộ N đơn"; màn "cần xử lý" cho lệnh bị server từ chối.
  - Ghép thiết bị, đăng nhập PIN, đổi người giữa ca.
- Non-functional: thêm 1 món < 100ms; từ "Thanh toán" tới ra bill < 2s; chạy được 8 tiếng không phải tải lại; giao diện chạm, dùng được bằng một tay trên tablet 8".

## Architecture
- `apps/pos`: React SPA; trạng thái đơn ở SQLite cục bộ (nguồn thật của máy), UI đọc qua hook.
- `packages/sync-client`: outbox lệnh (`order.save`, `order.pay`, `line.void`, `order.refund`, `shift.open/close`, `cash.move`), kéo thay đổi theo cursor, thử lại có backoff, idempotent theo `command_id`.
- `apps/api/sync/*`: nhận lệnh → validate zod → tính lại bằng domain → ghi → trả `accepted|rejected`.
- `packages/printing`: mẫu bill/tem/phiếu bếp/chốt ca → ESC/POS + TSPL; `apps/pos-shell-*` cung cấp `printer.send(target, bytes)`, `drawer.open()`.
- `print_job` cục bộ + đồng bộ lên để báo cáo in lỗi.

## Related code files
- Tạo: `apps/pos/*`, `apps/pos-shell-tauri/*`, `apps/pos-shell-capacitor/*`, `packages/sync-client/*`, `packages/printing/*`, `apps/api/sync/*`, `packages/db/schema/{order,payment,shift,print}.ts`, `apps/backoffice/app/(devices,printers)/*`.

## Implementation steps
1. Schema đơn/dòng (cây)/thanh toán/ca/cash_move/print_job/line_void ở server + bản cục bộ.
2. Sync: kéo catalog + cấu hình; outbox lệnh; màn "cần xử lý".
3. Màn bán + chọn tùy chọn + tổng tiền từ domain.
4. Thanh toán tiền mặt/QR/thẻ, nhiều phương thức.
5. Vỏ Tauri + Capacitor; cấu hình máy in ở backoffice; in bill/tem/phiếu pha chế; mở két.
6. Ca & két.
7. Hủy/hoàn + duyệt tại chỗ.
8. Offline: chuyển trạng thái, khóa thao tác, badge, test rút mạng.
9. Test: Playwright (bản web) cho luồng bán; harness offline **chạy tiếp trên dữ liệu lần trước**; checklist phần cứng với máy in thật; dữ liệu xấu.

## Todo list
- [ ] Schema đơn/thanh toán/ca/in
- [ ] Sync kéo + outbox + màn cần xử lý
- [ ] Màn bán + tùy chọn + tổng tiền
- [ ] Thanh toán nhiều phương thức
- [ ] Vỏ Tauri/Capacitor + in bill/tem/pha chế + két
- [ ] Ca & két (mở/thu chi/đóng/chuyển đơn mở)
- [ ] Hủy dòng, void có duyệt, đơn hoàn
- [ ] Offline + khóa thao tác + badge
- [ ] Test Playwright, harness offline, checklist phần cứng

## Success criteria
- Diễn tập 1 ca thật ở quán thí điểm (song song phần mềm cũ): tổng tiền khớp từng đồng, không mất đơn, rút mạng giữa giờ cao điểm vẫn bán.
- Tiền dự kiến cuối ca = đếm thực tế (sai lệch chỉ do người đếm).

## Risk assessment
- In tiếng Việt có dấu sai trên máy in rẻ ⇒ in dạng ảnh raster làm phương án dự phòng (chậm hơn).
- Hai máy cùng sửa đơn khi online ⇒ khóa lạc quan + báo ngay (đơn quầy ít gặp; bàn ở phase 06).
- Lệnh bị từ chối tồn đọng ⇒ cảnh báo trên backoffice khi > 0 quá 15 phút.

## Security considerations
- Mọi lệnh ký bằng token thiết bị; server kiểm quyền theo nhân viên trong lệnh và approval kèm theo.
- Không lưu số thẻ; thẻ đi qua máy POS ngân hàng rời.

## Next steps
- Phase 05 thêm QR tự xác nhận + hóa đơn điện tử + chốt ngày ⇒ R1.
