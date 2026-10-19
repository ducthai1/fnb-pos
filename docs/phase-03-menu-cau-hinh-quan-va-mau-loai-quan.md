# Phase 03 — Menu, cấu hình quán, mẫu loại quán (backoffice)

## Context links
- [catalog §4 menu & giá, §21 loại quán](logic-catalog-flows-rules-and-design-decisions.md)
- [research A1 cấu trúc menu](research/research-a-ban-hang-menu-don-ban-bep-thanh-toan-ca.md) · [research E — CukCuk InventoryItemType](research/research-e-api-cong-khai-kiotviet-cukcuk-sapo-pos365-ipos.md)

## Overview
- Ưu tiên: P0 cho R1. Phụ thuộc: phase 01, 02. Ước lượng: 2–3 tuần-người.
- Chủ quán tự dựng được menu trà sữa/cafe trong < 30 phút nhờ mẫu loại quán.

## Key insights
- Nhóm tùy chọn cần min/max/bắt buộc, điều kiện theo size, chọn trùng, max theo tùy chọn (Toast/Speedline/Oolio).
- "Loại quán" = tổ hợp công tắc + dữ liệu mẫu (Odoo chỉ có cờ restaurant/bar).
- Size chỉ là giá thì báo cáo không tách theo size được (Toast) ⇒ biến thể là thực thể có báo cáo riêng.

## Requirements
- Functional:
  - Danh mục, món, biến thể, nhóm tùy chọn + tùy chọn (giá cộng; ô `ingredient_delta` để trống tới phase 07), combo.
  - Loại hàng (`product_kind`); cờ: `track_stock`, `earns_points`, `sold_by_weight`, `open_price`, `print_cup_label`, trạm bếp.
  - Bảng giá: theo chi nhánh, kênh, khung giờ/ngày.
  - Hết món tay (`manual_86`) theo chi nhánh/kênh.
  - Ảnh món (nén, nhiều cỡ).
  - Mẫu loại quán: cafe, trà sữa, quán ăn, bar, tiệm bánh — chọn lúc tạo chi nhánh ⇒ sinh nhóm tùy chọn mẫu + bật công tắc mặc định (catalog §21); sửa tự do sau đó.
  - Nhập/xuất menu bằng file Excel/CSV.
- Non-functional: thay đổi menu đẩy xuống máy qua `change_seq` (phase 04); không xóa cứng món đã bán (lưu trữ thay vì xóa).

## Architecture
- `packages/db/schema/catalog.ts`: `category, product, variant, modifier_group, modifier_group_condition, modifier_option, product_modifier_group, combo, combo_slot, combo_slot_option, price_list, price_list_item, station, product_availability`.
- `packages/shop-templates/*.json` + hàm `applyTemplate(branch, templateKey)` idempotent.

## Related code files
- Tạo: `packages/db/schema/catalog.ts`, `packages/shop-templates/*`, `apps/api/routes/catalog/*`, `apps/backoffice/app/(menu)/*`, `packages/contracts/catalog.ts`.

## Implementation steps
1. Schema catalog + API CRUD + kiểm tra bằng `validateModifiers` của domain.
2. UI backoffice: món, biến thể, nhóm tùy chọn (kéo thả thứ tự), combo, bảng giá.
3. Xem trước "khách sẽ chọn thế nào" ngay trong màn sửa món.
4. Mẫu loại quán + màn chọn khi tạo chi nhánh.
5. Nhập/xuất Excel.
6. Test UI với **dữ liệu xấu**: tên món 80 ký tự, 30 topping, giá 0đ, tùy chọn trùng tên.

## Todo list
- [ ] Schema + API catalog
- [ ] UI món/biến thể/nhóm tùy chọn/combo/bảng giá
- [ ] Xem trước lựa chọn của khách
- [ ] 5 mẫu loại quán + applyTemplate
- [ ] Nhập/xuất Excel
- [ ] Test dữ liệu xấu

## Success criteria
- Dựng xong menu trà sữa thật của quán thí điểm (≥ 40 món) bằng mẫu + chỉnh sửa trong < 30 phút.
- Cấu hình nhóm tùy chọn sai (min > max, bắt buộc mà không có tùy chọn) bị chặn kèm lý do.

## Risk assessment
- UI cấu hình tùy chọn quá phức tạp cho chủ quán ⇒ mặc định đơn giản (chọn 1/chọn nhiều), phần nâng cao ẩn.

## Security considerations
- Upload ảnh: kiểm loại file, giới hạn dung lượng, lưu ở object storage theo tenant.

## Next steps
- Phase 04 hiển thị menu này ở POS.
