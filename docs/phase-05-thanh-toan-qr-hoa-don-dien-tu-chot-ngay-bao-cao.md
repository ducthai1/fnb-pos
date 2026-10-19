# Phase 05 — QR tự xác nhận, hóa đơn điện tử, chốt ngày, báo cáo cơ bản ⇒ **R1**

## Context links
- [catalog §8 thanh toán, §17 báo cáo, §18 hóa đơn điện tử](logic-catalog-flows-rules-and-design-decisions.md)
- [research D1 hóa đơn, D2 VietQR](research/research-d-hoa-don-dien-tu-vietqr-giao-hang-offline-in-an.md) · [research E — trạng thái HĐĐT của CukCuk](research/research-e-api-cong-khai-kiotviet-cukcuk-sapo-pos365-ipos.md)

## Overview
- Ưu tiên: P0 — không có phần này thì quán không dùng thật được (hóa đơn từ máy tính tiền là bắt buộc với ăn uống). Phụ thuộc: 04, spike S3 + S4, trả lời kế toán thuế. Ước lượng: 4–6 tuần-người.
- Kết thúc phase = **R1: quán thí điểm (cafe có quầy + bàn) bỏ phần mềm cũ.** Phụ thuộc thêm: 04b.
- Task chi tiết: [T05-01…13](tasks-r1-detailed-task-board.md).

## Key insights
- Pháp lý hóa đơn đang dựa trên nguồn thứ cấp ⇒ phase này chỉ bắt đầu code phần hóa đơn khi kế toán đã xác nhận phase 00.
- Trạng thái hóa đơn tách khỏi trạng thái thanh toán (CukCuk: phát hành `-2…5`, gửi CQT `0…4`).
- Webhook ngân hàng phải idempotent theo `(gateway, reference_code)`.

## Requirements
- Functional:
  - QR: `payment_intent` (mã nội dung duy nhất), nhận webhook SePay hoặc PayOS (chọn ở spike S3), tự khớp → POS báo "đã nhận tiền" realtime; ca thiếu/thừa/sai nội dung/2 lần ⇒ màn khớp tay; hết hạn QR.
  - Hóa đơn điện tử: hồ sơ HĐĐT theo chi nhánh (MST, nhà cung cấp, `regime_version`); mỗi lần thanh toán xong ⇒ 1 hóa đơn; thông tin người mua khi khách yêu cầu (MST/CCCD/SĐT); in mã tra cứu/QR lên bill; gửi dữ liệu cuối ngày (`einvoice_submission_batch`); hàng đợi khi offline; cảnh báo hóa đơn chưa gửi.
  - Hoàn tiền sau khi có hóa đơn: theo cách kế toán chốt ở phase 00.
  - Chốt ngày kinh doanh: không còn ca mở, hóa đơn đã gửi, sinh báo cáo cuối ngày.
  - Báo cáo cơ bản (backoffice + in): doanh thu theo ngày kinh doanh/giờ/món/topping/nhân viên/phương thức; hủy món; giảm giá; chốt ca. Định nghĩa doanh thu cố định (catalog §17).
- Non-functional: webhook → POS báo đã nhận < 5s; không bao giờ mất hóa đơn (mỗi thanh toán có đúng 1 hóa đơn hoặc 1 bản ghi lỗi cần xử lý).

## Architecture
- `apps/api/payments/*`: `payment_intent`, `bank_transaction` (unique), `payment_match`; worker khớp; đẩy realtime tới máy.
- `apps/api/einvoice/*`: adapter interface `EInvoiceProvider { issue, cancelOrAdjust, submitDailyBatch, lookup }` + 1 adapter cho nhà cung cấp của quán thí điểm; job pg-boss gửi lại có backoff.
- `apps/api/reports/*`: truy vấn theo `business_date`; view tổng hợp theo ngày.

## Related code files
- Tạo: `apps/api/{payments,einvoice,reports}/*`, `packages/db/schema/{payment-intent,bank-transaction,einvoice}.ts`, `apps/backoffice/app/(reports,einvoice-settings,payment-settings)/*`, cập nhật `apps/pos` (màn chờ QR, in mã tra cứu).

## Implementation steps
1. payment_intent + webhook + khớp + màn khớp tay + realtime.
2. Hồ sơ HĐĐT + adapter nhà cung cấp + phát hành theo từng thanh toán + hàng đợi.
3. Gửi dữ liệu cuối ngày + cảnh báo + xử lý lỗi.
4. Chốt ngày kinh doanh.
5. Báo cáo cơ bản + in báo cáo cuối ngày.
6. Diễn tập go-live: chạy song song phần mềm cũ 3–5 ngày, so số từng ngày, rồi cắt.

## Todo list
- [ ] QR tự xác nhận + khớp tay
- [ ] Hóa đơn điện tử: hồ sơ, adapter, phát hành, hàng đợi
- [ ] Gửi cuối ngày + cảnh báo
- [ ] Chốt ngày kinh doanh
- [ ] Báo cáo cơ bản
- [ ] Chạy song song 3–5 ngày rồi go-live R1

## Success criteria
- 5 ngày song song: doanh thu, số hóa đơn, tiền từng phương thức khớp phần mềm cũ.
- Webhook gửi trùng 10 lần ⇒ 1 thanh toán.
- Mất mạng cả buổi ⇒ hóa đơn được phát hành/gửi đủ khi có mạng lại, trong hạn cuối ngày.

## Risk assessment
- Nhà cung cấp HĐĐT chậm/lỗi giờ cao điểm ⇒ phát hành bất đồng bộ, bill in trước, mã tra cứu cập nhật sau (nếu kế toán cho phép) — chốt ở phase 00.
- Quy định thay đổi ⇒ `regime_version` + adapter cách ly.

## Security considerations
- Khóa API nhà cung cấp HĐĐT, khóa webhook: mã hóa khi lưu, chỉ worker đọc được.
- Kiểm chữ ký webhook; chặn IP nếu nhà cung cấp hỗ trợ.

## Next steps
- R1 chạy ổn 2 tuần ⇒ phase 06/07 (cho quán có bàn và quản lý kho).
