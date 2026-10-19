# Phase 04b — Bàn cơ bản (cho quán thí điểm: cafe có quầy + bàn)

## Context links
- [catalog §6 bàn, §7 bếp, §20 offline](logic-catalog-flows-rules-and-design-decisions.md) · [decision-log D-005](decision-log.md)
- [research F2 (Odoo: 1 đơn mở/bàn, chuyển/gộp)](research/research-f-odoo-pos-18-luat-chinh-xac-tu-ma-nguon.md)
- Task chi tiết: [T4B-01…09](tasks-r1-detailed-task-board.md)

## Overview
- Ưu tiên: P0 cho R1 (user chọn quán thí điểm có cả quầy và bàn, 2026-10-19). Phụ thuộc: 04 (màn bán, phiếu pha chế theo trạm, sync). Ước lượng: 2–3 tuần-người.
- Phạm vi: đủ để một cafe phục vụ khách ngồi bàn. **Không** gồm: gộp/ghép/tách bàn, chia bill, course, màn hình bếp, máy chính trong LAN (để phase 06 / R2).

## Key insights
- Odoo ép tối đa 1 đơn mở trên 1 bàn; hai máy cùng mở bàn thì đè nhau ⇒ cần khóa phiên bản và báo xung đột ngay khi lưu.
- Gửi pha chế theo lượt dùng lại `kitchen_ticket` của phase 04: lượt 2 chỉ in món mới.
- Cafe VN hay có kiểu "gọi ở quầy, trả trước, nhân viên mang ra bàn" ⇒ đơn quầy gắn số bàn, không mở bàn.

## Requirements
- Functional:
  - Sơ đồ khu vực/bàn (backoffice kéo thả), số ghế.
  - POS: trạng thái bàn (trống / có khách / chờ thanh toán), thời gian ngồi.
  - Mở bàn, số khách, gọi nhiều lượt, ghi chú, gửi pha chế.
  - In tạm tính, in lại.
  - Thanh toán tại bàn (dùng màn thanh toán của phase 04), đóng bàn.
  - Chuyển sang bàn **trống**.
  - Đơn quầy gắn số bàn (`table_tag`), không chiếm bàn.
  - Ca: đơn bàn còn mở khi đóng ca được chuyển sang ca sau (D-013).
- Non-functional: hai máy cùng sửa một bàn khi online ⇒ máy lưu sau bị báo, không đè; mất mạng ⇒ máy đã mở bàn giữ bàn đó, máy khác chỉ xem.

## Architecture
- Bảng: `area`, `table` (đã có khung từ phase 01) + `table_session(table_id, order_id, opened_at, guests)`; `order.table_id` + `order.table_name_snapshot`; `order.table_tag` cho đơn quầy.
- Ràng buộc DB: unique một `table_session` đang mở trên mỗi bàn.
- Đơn bàn khi online: server là nguồn thật, `version` khóa lạc quan.

## Related code files
- Tạo/sửa: `apps/backoffice/app/(floor-plan)/*`, `apps/pos/src/screens/floor/*`, `apps/pos/src/features/table/*`, `packages/domain/src/table/*`, `packages/db/schema/table-session.ts`, `apps/api/src/sync/handlers/table-*.ts`.

## Implementation steps
1. Schema + backoffice sơ đồ bàn.
2. Màn sơ đồ bàn ở POS.
3. Mở bàn → gọi món nhiều lượt → gửi pha chế.
4. Tạm tính, in lại.
5. Thanh toán tại bàn, đóng bàn.
6. Chuyển sang bàn trống.
7. Đơn quầy gắn số bàn.
8. Khóa phiên bản + UI xung đột.
9. Luật offline với bàn.
10. E2E + kịch bản đồng bộ (danh sách trong bảng task).

## Todo list
- [ ] T4B-01 sơ đồ bàn backoffice
- [ ] T4B-02 màn sơ đồ bàn POS
- [ ] T4B-03 mở bàn, nhiều lượt, gửi pha chế
- [ ] T4B-04 tạm tính
- [ ] T4B-05 trả tại bàn, đóng bàn
- [ ] T4B-06 chuyển sang bàn trống
- [ ] T4B-07 đơn quầy gắn số bàn
- [ ] T4B-08 khóa phiên bản + xung đột
- [ ] T4B-09 offline với bàn

## Success criteria
- Diễn tập 1 buổi ở quán thí điểm: không bàn nào bị đè, lượt 2 không in lại món cũ, tạm tính = số tiền thanh toán.

## Risk assessment
- Nhân viên cần order tại bàn bằng điện thoại ⇒ kéo FT-105 (order điện thoại + máy trạm in) từ phase 06 vào R1; quyết ở T00-01.

## Security considerations
- Chuyển bàn, đóng bàn chưa thanh toán: theo khóa quyền phase 01.

## Next steps
- Phase 05. Phần bàn nâng cao ở phase 06.
