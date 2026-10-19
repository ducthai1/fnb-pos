# Phase 06 — Bàn, bếp, order bằng điện thoại, chia/gộp/chuyển bàn

## Context links
- [catalog §6 bàn, §7 bếp, §8 chia bill, §20 offline](logic-catalog-flows-rules-and-design-decisions.md)
- [research A3, A4](research/research-a-ban-hang-menu-don-ban-bep-thanh-toan-ca.md) · [research F2, F3, F10](research/research-f-odoo-pos-18-luat-chinh-xac-tu-ma-nguon.md)

## Overview
- Ưu tiên: P1 (R2). Phụ thuộc: R1. Ước lượng: 4–6 tuần-người.
- Mở cho quán ăn, nhà hàng, bar có bàn.
- **Đã làm ở phase 04b (R1), không làm lại:** sơ đồ bàn, mở bàn, gọi nhiều lượt, gửi pha chế, tạm tính, trả tại bàn, chuyển sang bàn trống, đơn quầy gắn số bàn, 1 đơn mở/bàn + khóa phiên bản, luật offline với bàn. Phase này chỉ còn: gộp/ghép/tách bàn, chia bill, giữ món, course, màn hình bếp, order bằng điện thoại (nếu chưa kéo vào R1), đặt bàn, máy chính trong LAN.

## Key insights
- Odoo: tối đa 1 đơn mở/bàn; chuyển sang bàn có khách = gộp; trạng thái đã gửi bếp đi theo dòng; liên kết chia bill chỉ nằm ở bộ nhớ client (mất khi tải lại) ⇒ ở đây lưu `split_from_order_id`.
- Gửi bếp = so với những gì đã gửi ⇒ lưu `kitchen_ticket` theo dòng, không lưu ảnh chụp JSON.
- Toast: course chỉ với ăn tại chỗ; giữ món; hủy sau gửi cần duyệt.

## Requirements
- Functional:
  - Sơ đồ khu vực/bàn (kéo thả ở backoffice), trạng thái bàn (trống/có khách/chờ thanh toán/đặt trước), thời gian ngồi.
  - Mở bàn, số khách, gọi món nhiều lượt, gửi bếp, **giữ món**, **course**, ghi chú.
  - Chuyển bàn, gộp bàn, ghép bàn vật lý, tách món sang bàn/đơn khác, chia bill (theo món/ghế/đều).
  - Bill tạm tính, in lại.
  - Trạm bếp: định tuyến theo nhóm/món, phiếu mới/sửa/hủy/đổi kiểu phục vụ; in lại phiếu lỗi.
  - Màn hình bếp (KDS, online): `queued → preparing → ready → served`, gom theo bàn, báo trễ.
  - Phục vụ dùng điện thoại (PWA hoặc app): order tại bàn, lệnh in đi qua máy trạm in.
  - Đặt bàn cơ bản: giữ bàn theo giờ + ghi chú.
  - (Có thể tách) Chế độ **máy chính trong LAN**: một máy Windows/Android làm trung tâm khi mất internet để nhiều máy chia sẻ bàn.
- Non-functional: hai phục vụ cùng sửa một bàn ⇒ người lưu sau bị báo xung đột ngay, không đè; bếp không bao giờ mất phiếu im lặng.

## Architecture
- Schema: `table_session`, `kitchen_ticket`, `kitchen_ticket_line(order_line_id, qty_delta, kind, station_id, status, printed_at)`, `order.split_from_order_id`, `order_line.hold`, `order_line.course_no`, `table.parent_table_id`.
- Đơn mở trên bàn: server là nguồn thật khi online, khóa lạc quan `version`.
- KDS: realtime qua WebSocket; trạng thái món là lệnh sync như mọi lệnh khác.
- Máy chính LAN: cùng API sync nhưng chạy trong vỏ native, máy khác tìm qua mDNS; khi có internet lại thì máy chính đẩy lên cloud.

## Related code files
- Tạo/sửa: `apps/pos/(floor,table,kitchen-tickets)/*`, `apps/kds` (hoặc route trong pos), `packages/domain/{split,merge,kitchen-diff}.ts`, `apps/backoffice/app/(floor-plan,stations)/*`, `apps/pos-shell-*/lan-hub/*` (nếu làm).

## Implementation steps
1. Sơ đồ bàn + trạng thái + mở/đóng bàn.
2. kitchen_ticket + định tuyến + in theo trạm + in lại.
3. Giữ món, course.
4. Chuyển/gộp/ghép/tách/chia bill (domain đã có từ phase 02).
5. Order bằng điện thoại + máy trạm in.
6. KDS.
7. Đặt bàn cơ bản.
8. (Tách được) máy chính LAN.
9. Test: 2–3 máy cùng một bàn (xung đột), in lỗi giữa chừng (phiếu không mất), chia bill rồi tải lại trang.

## Todo list
- [ ] Sơ đồ bàn + trạng thái
- [ ] kitchen_ticket + định tuyến + in lại
- [ ] Giữ món + course
- [ ] Chuyển/gộp/ghép/tách/chia bill
- [ ] Order bằng điện thoại + máy trạm in
- [ ] KDS
- [ ] Đặt bàn cơ bản
- [ ] Máy chính LAN (tùy chọn)
- [ ] Test xung đột, in lỗi, tải lại sau chia bill

## Success criteria
- Diễn tập 1 buổi tối ở quán có bàn: không phiếu bếp nào mất, không bàn nào bị đè, chia bill khớp tổng.

## Risk assessment
- Máy chính LAN phức tạp (2 nguồn thật) ⇒ làm sau cùng, chỉ khi quán thí điểm có bàn thật sự cần.

## Security considerations
- Máy chính LAN chỉ nhận máy đã ghép cùng chi nhánh; kênh LAN mã hóa bằng khóa cấp khi ghép.

## Next steps
- Phase 07 (kho) chạy song song được.
