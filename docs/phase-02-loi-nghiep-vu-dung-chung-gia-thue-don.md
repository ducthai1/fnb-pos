# Phase 02 — Lõi nghiệp vụ dùng chung (`packages/domain`)

## Context links
- [catalog §4 giá, §5 đơn, §8 thuế/phí/làm tròn, §9 hủy/hoàn](logic-catalog-flows-rules-and-design-decisions.md)
- [research F — luật Odoo: F1, F4, F7](research/research-f-odoo-pos-18-luat-chinh-xac-tu-ma-nguon.md)

## Overview
- Ưu tiên: P0. Phụ thuộc: không (TS thuần). Ước lượng: 3–4 tuần-người.
- Viết **một lần** phần tính toán mà máy quầy (offline) và server (kiểm lại) cùng chạy. Đây là chỗ sai một đồng là mất niềm tin của chủ quán.

## Key insights
- Odoo: giảm toàn đơn tách một dòng âm cho mỗi thuế suất; đơn đã trả bất biến; hoàn tiền = đơn mới dòng âm có `refunded_line_id`.
- CukCuk: phân bổ khuyến mãi xuống dòng (`AllocationAmount`); thuế/phí theo kênh; cờ phí dịch vụ trước/sau khuyến mãi.
- Odoo dựng sẵn bảng giá cho cả ca ⇒ happy hour không tự bật. Ở đây tính giá lúc thêm dòng.

## Requirements
- Functional (hàm thuần, không I/O):
  - `resolvePrice(variant, modifiers, channel, branch, at)` với bảng giá theo phạm vi + khung giờ; kiểu giá base/size/nhập tay/theo cân.
  - `validateModifiers(product, variant, selections)`: min/max/bắt buộc, điều kiện theo biến thể, chọn trùng, max theo tùy chọn.
  - Cây dòng đơn: `item | modifier | combo_component | discount`.
  - `computeOrderTotals(order, taxProfile, serviceProfile, rounding)`: gộp, giảm, phí dịch vụ (trước/sau KM), VAT (gồm/cộng thuế), làm tròn (chỉ tiền mặt hoặc toàn đơn).
  - `allocateDiscount(order, discount)`: phân bổ theo tỉ lệ, Σ phân bổ = tổng giảm (dư đồng lẻ dồn vào dòng lớn nhất).
  - Máy trạng thái đơn `draft → paid → posted`, `draft → cancelled`; lệnh không hợp lệ ném lỗi có mã.
  - `splitOrder`, `mergeOrders`, `voidLine`, `buildRefund(order, lines, qty)` (giới hạn số lượng còn hoàn được, tính cả đơn hoàn chưa trả).
  - `businessDate(at, branchCutoffHour, tz)`.
- Non-functional: không phụ thuộc runtime (chạy được trong trình duyệt, Node, WebView); 100% hàm có test; property test cho tiền.

## Architecture
- `packages/domain/{pricing,modifiers,order,totals,tax,rounding,allocation,refund,business-date,errors}.ts`, mỗi file < 200 dòng.
- Chỉ nhận dữ liệu đã nạp; không đọc DB. Server và client gọi cùng phiên bản gói (khóa phiên bản trong lệnh sync để phát hiện lệch).

## Related code files
- Tạo: `packages/domain/*`, `packages/contracts/order.ts`.

## Implementation steps
1. Kiểu dữ liệu: tiền (bigint đồng), số lượng (decimal 3 chữ số), tỉ lệ (basis point).
2. Pricing + modifiers + combo.
3. Totals: thuế/phí theo kênh, làm tròn, giảm toàn đơn tách theo thuế suất.
4. Allocation + refund + split/merge + void.
5. Máy trạng thái + mã lỗi.
6. Bộ test: ví dụ cụ thể từ quán thí điểm + property test (Σ dòng = tổng; hoàn ≤ gốc; phân bổ không âm; làm tròn không lệch quá 1 bậc).
7. Gắn `domain_version` vào mọi lệnh sync.

## Todo list
- [ ] Kiểu tiền/số lượng/tỉ lệ
- [ ] resolvePrice + validateModifiers + combo
- [ ] computeOrderTotals (thuế/phí/làm tròn)
- [ ] allocateDiscount, buildRefund, split/merge, voidLine
- [ ] Máy trạng thái đơn, businessDate
- [ ] Test ví dụ + property test
- [ ] domain_version

## Success criteria
- Mỗi luật của catalog §4, §5, §8, §9 có ít nhất 1 test; gỡ luật đó ra là test đỏ.
- 10.000 đơn ngẫu nhiên: tổng client = tổng server, không lệch 1 đồng.

## Risk assessment
- Luật làm tròn/thuế VN chưa chắc ⇒ cấu hình hóa (phương pháp làm tròn, giá gồm thuế) và chốt bằng ví dụ thật của kế toán ở phase 00.
- Lệch phiên bản domain giữa máy cũ và server ⇒ server từ chối lệnh có `domain_version` quá cũ, máy buộc cập nhật.

## Security considerations
- Server không bao giờ tin tổng tiền client gửi; luôn tính lại.

## Next steps
- Phase 03 dùng kiểu dữ liệu menu; phase 04 dùng toàn bộ.
