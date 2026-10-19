# Phase 09 — Chuỗi nhiều chi nhánh, chuyển kho, bếp trung tâm

## Context links
- [catalog §3 tổ chức, §4 giá theo chi nhánh, §12 chuyển kho](logic-catalog-flows-rules-and-design-decisions.md)
- [research C1](research/research-c-chuoi-khuyen-mai-thanh-vien-phan-quyen-bao-cao.md) · [research B6](research/research-b-kho-dinh-luong-ban-thanh-pham-gia-von.md)

## Overview
- Ưu tiên: P2 (R3). Phụ thuộc: 07; khung tổ chức đã có từ phase 01. Ước lượng: 3–5 tuần-người.

## Key insights
- Giá chi nhánh = ghi đè trên biến thể, thiếu thì lấy giá chung (Square/Toast).
- Cấu hình kế thừa đã có từ phase 01 ⇒ phase này chủ yếu là UI quản trị + chuyển kho + báo cáo hợp nhất.
- Quy trình bếp trung tâm (giá nội bộ, nhận thiếu/dư) không hệ nào công bố ⇒ thiết kế tối giản, kiểm với chuỗi thật.

## Requirements
- Functional:
  - Menu trung tâm theo thương hiệu; chi nhánh bật/tắt món, ghi đè giá theo biến thể.
  - Đẩy thay đổi menu cho nhiều chi nhánh cùng lúc, có lịch áp dụng.
  - Chuyển kho: tạo phiếu → `in_transit` → nhận (thiếu/dư có lý do) → bút toán hai đầu.
  - Bếp trung tâm: chi nhánh đặt hàng nội bộ → bếp sản xuất (phiếu sản xuất phase 07) → chuyển kho; giá chuyển = giá vốn.
  - Báo cáo hợp nhất theo thương hiệu/tổ chức; so sánh chi nhánh.
  - Quản lý vùng: quyền theo nhóm chi nhánh.
- Non-functional: cấu hình hiệu lực = chi nhánh ?? thương hiệu ?? hệ thống, giải thích được "giá này lấy từ đâu" trên UI.

## Architecture
- Schema: `price_override(variant, branch)`, `menu_publish(schedule)`, `stock_transfer`, `internal_order`, `branch_group`.
- Báo cáo hợp nhất: view theo `organization_id`/`brand_id`, chỉ cộng các chi nhánh người xem có quyền.

## Related code files
- Tạo: `apps/api/{transfers,internal-orders,menu-publish}/*`, `apps/backoffice/app/(chain,transfers)/*`.

## Implementation steps
1. UI menu trung tâm + ghi đè chi nhánh + "lấy từ đâu".
2. Đẩy menu có lịch.
3. Chuyển kho + nhận thiếu/dư.
4. Đặt hàng nội bộ + bếp trung tâm.
5. Báo cáo hợp nhất + quyền theo nhóm chi nhánh.

## Todo list
- [ ] Menu trung tâm + ghi đè
- [ ] Đẩy menu có lịch
- [ ] Chuyển kho
- [ ] Đặt hàng nội bộ + bếp trung tâm
- [ ] Báo cáo hợp nhất + quyền nhóm chi nhánh

## Success criteria
- Chuỗi 3 điểm thử: đổi giá một món cho 1 chi nhánh không ảnh hưởng 2 chi nhánh còn lại; chuyển kho khớp tồn hai đầu.

## Risk assessment
- Quá sớm cho khách đầu tiên (1 quán) ⇒ làm khi có khách chuỗi thật.

## Security considerations
- Nhân viên chi nhánh A không thấy dữ liệu chi nhánh B trừ khi có quyền nhóm.

## Next steps
- Phase 10, 11.
