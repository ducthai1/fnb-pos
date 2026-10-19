# Phase 07 — Kho, định lượng, bán thành phẩm, giá vốn

## Context links
- [catalog §12 kho, §13 giá vốn](logic-catalog-flows-rules-and-design-decisions.md)
- [research B (toàn bộ)](research/research-b-kho-dinh-luong-ban-thanh-pham-gia-von.md) · [research F9 kho](research/research-f-odoo-pos-18-luat-chinh-xac-tu-ma-nguon.md)

## Overview
- Ưu tiên: P1 (R2). Phụ thuộc: R1. Ước lượng: 5–7 tuần-người.
- Chủ quán biết: còn bao nhiêu nguyên liệu, ly nào lời bao nhiêu, ai làm hao.

## Key insights
- Thời điểm trừ kho khác nhau giữa các hệ ⇒ cấu hình theo chi nhánh, chốt vào ca.
- Kiểm kê là mốc ghi đè (Toast), có phiếu tồn đầu (Sapo).
- Bán thành phẩm có tồn riêng + phiếu sản xuất (Toast prep item, Lightspeed batch).
- Odoo: topping không trừ kho; phiếu kho lỗi bị bỏ qua ⇒ tồn âm âm thầm. Ở đây có `ingredient_delta` và hàng đợi phiếu lỗi.

## Requirements
- Functional:
  - Nguyên liệu, nhóm, đơn vị gốc + quy đổi nhiều cấp; đơn vị nhập ≠ đơn vị dùng.
  - Công thức theo biến thể + `ingredient_delta` theo tùy chọn (mức đường = hệ số); **phiên bản công thức**; dòng đơn lưu phiên bản.
  - Bán thành phẩm + phiếu sản xuất (mẻ, sản lượng thực tế), lồng nhiều tầng.
  - Nhà cung cấp, đơn đặt hàng, phiếu nhập (nhận một phần, giá nhập), trả nhà cung cấp; công nợ nhà cung cấp cơ bản.
  - Phiếu hủy (lý do), kiểm kê (mốc ghi đè, chênh lệch, duyệt), tồn đầu.
  - `inventory.deduct_at`: `on_send_to_kitchen | on_payment | on_shift_close`; món làm theo mẻ trừ khi xong mẻ.
  - `allow_negative_stock` (mặc định cho phép + cảnh báo), `auto_86_when_stock_zero`.
  - Giá vốn bình quân gia quyền di động; giá vốn món theo phiên bản công thức; báo cáo lãi gộp theo món; báo cáo chênh lệch lý thuyết vs thực tế.
  - Tồn tối thiểu + đề xuất đặt hàng; lô + hạn dùng cho tiệm bánh (cảnh báo, chưa FEFO).
  - Hàng đợi "phiếu kho lỗi".
- Non-functional: tồn = Σ bút toán từ mốc kiểm kê gần nhất; dựng lại được tồn ở bất kỳ thời điểm nào.

## Architecture
- Schema: `ingredient, unit, unit_conversion, recipe, recipe_version, recipe_line, modifier_ingredient_delta, stock_location, stock_document(type, status), stock_document_line, stock_ledger(ingredient, location, qty ±, unit_cost, doc_id, business_date), stock_checkpoint, production_order, supplier, purchase_order, supplier_ledger, failed_stock_post`.
- Trừ kho là job: lệnh bán → nổ công thức (domain `explodeRecipe`) → bút toán ledger.

## Related code files
- Tạo: `packages/db/schema/inventory.ts`, `packages/domain/{recipe-explode,costing-mac,unit-convert}.ts`, `apps/api/inventory/*`, `apps/backoffice/app/(inventory,recipes,suppliers,stock-count)/*`, POS: màn kiểm kê nhanh + báo hủy trên tablet.

## Implementation steps
1. Đơn vị + quy đổi + nguyên liệu.
2. Công thức có phiên bản + delta tùy chọn; nổ công thức (domain, test dày).
3. Ledger + phiếu kho + tồn đầu + kiểm kê mốc ghi đè.
4. Trừ kho theo cấu hình + hàng đợi phiếu lỗi.
5. Bán thành phẩm + phiếu sản xuất.
6. Nhập hàng, nhà cung cấp, trả hàng, công nợ.
7. Giá vốn MAC + lãi gộp + chênh lệch.
8. Cảnh báo tồn, hết món tự động, lô/hạn.
9. Test: đổi công thức giữa ca (đơn cũ giữ phiên bản cũ), tồn âm rồi nhập bù (giá vốn), kiểm kê giữa chừng.

## Todo list
- [ ] Đơn vị, quy đổi, nguyên liệu
- [ ] Công thức có phiên bản + delta + explodeRecipe
- [ ] Ledger, phiếu, tồn đầu, kiểm kê
- [ ] Trừ kho cấu hình + phiếu lỗi
- [ ] Bán thành phẩm + sản xuất
- [ ] Nhập hàng, NCC, trả hàng, công nợ
- [ ] MAC, lãi gộp, chênh lệch
- [ ] Cảnh báo, auto-86, lô/hạn
- [ ] Test các ca khó

## Success criteria
- Quán thí điểm kiểm kê cuối tuần: chênh lệch giải thích được bằng phiếu hủy/hao hụt; giá vốn ly trà sữa khớp bảng tính tay của chủ quán.

## Risk assessment
- Chủ quán không nhập công thức ⇒ cho phép bật kho từng phần (chỉ hàng bán thẳng trước), mẫu công thức trà sữa/cafe có sẵn.

## Security considerations
- Quyền `stock_adjust` riêng; kiểm kê lệch lớn cần duyệt.

## Next steps
- Phase 09 thêm chuyển kho giữa chi nhánh.
