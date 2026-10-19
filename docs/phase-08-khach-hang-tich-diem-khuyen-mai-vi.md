# Phase 08 — Khách hàng, tích điểm, khuyến mãi, thẻ trả trước

## Context links
- [catalog §14 khuyến mãi, §15 thành viên, §23 câu 7–9](logic-catalog-flows-rules-and-design-decisions.md)
- [research C2, C3](research/research-c-chuoi-khuyen-mai-thanh-vien-phan-quyen-bao-cao.md) · [research F6 — engine Odoo](research/research-f-odoo-pos-18-luat-chinh-xac-tu-ma-nguon.md)

## Overview
- Ưu tiên: P2 (R3). Phụ thuộc: R1; câu 7–9 §23 đã có câu trả lời của chủ quán. Ước lượng: 4–6 tuần-người.

## Key insights
- Odoo gộp khuyến mãi/coupon/điểm/gift card/ví vào một engine điểm, cộng dồn mọi khuyến mãi tự động ⇒ khó hiểu. Ở đây tách khuyến mãi khỏi điểm, tách sổ điểm khỏi sổ tiền, cộng dồn tường minh.
- Odoo: điểm trên tiền sau giảm gồm thuế; hoàn đơn không tự trừ điểm. Ở đây có bút toán điểm âm.
- Không hệ nào công bố luật hoàn khuyến mãi khi hoàn một phần ⇒ cần chủ quán chốt.

## Requirements
- Functional:
  - Khách: SĐT, tên, ngày sinh (tùy chọn), ghi chú; gắn vào đơn bằng SĐT/QR thành viên.
  - Khuyến mãi: loại (giảm %/tiền, mua X tặng Y, giá combo, happy hour, theo kênh, theo hạng), điều kiện, lịch, phạm vi, giới hạn dùng, `stackable` + `priority`, voucher mã, món mời (cần quyền).
  - Mặc định không cộng dồn: chọn khuyến mãi có lợi nhất trong nhóm không cộng dồn.
  - Tích điểm: tỉ lệ, cơ sở tính, làm tròn (mặc định: trên tiền thực trả, làm tròn xuống số nguyên); món không tích điểm; đổi điểm; hết hạn; hạng thẻ (theo chốt của chủ quán).
  - Hoàn đơn ⇒ bút toán điểm âm tỉ lệ; khuyến mãi xử lý theo câu 7 §23.
  - Thẻ trả trước/ví: nạp, trừ, hoàn; là phương thức thanh toán.
  - Offline: khuyến mãi tự động chạy được (dữ liệu đã đồng bộ); voucher dùng một lần, điểm, ví ⇒ chỉ online.
- Non-functional: engine khuyến mãi trong `packages/domain` (chạy cả máy quầy và server); kết quả không phụ thuộc thứ tự thêm món.

## Architecture
- `packages/domain/promotions/{evaluate,select-best,apply,allocate}.ts`.
- Schema: `customer, promotion, promotion_rule, promotion_reward, voucher, voucher_redemption, loyalty_program, loyalty_ledger, wallet, wallet_ledger, customer_tier`.

## Related code files
- Tạo: các file trên + `apps/api/{customers,promotions,loyalty,wallet}/*`, `apps/backoffice/app/(customers,promotions,loyalty)/*`, POS: màn gắn khách, áp voucher, đổi điểm.

## Implementation steps
1. Khách hàng + gắn vào đơn.
2. Engine khuyến mãi (domain) + test: cộng dồn, ưu tiên, phân bổ, hoàn một phần, đổi thứ tự thêm món.
3. Voucher + giới hạn dùng.
4. Sổ điểm + đổi điểm + hết hạn + hạng.
5. Ví/thẻ trả trước.
6. Báo cáo khuyến mãi, điểm, ví.

## Todo list
- [ ] Khách hàng
- [ ] Engine khuyến mãi + test
- [ ] Voucher
- [ ] Sổ điểm, đổi điểm, hết hạn, hạng
- [ ] Ví/thẻ trả trước
- [ ] Báo cáo

## Success criteria
- Mọi luật khuyến mãi chủ quán mô tả được dựng bằng cấu hình, không cần code; số dư điểm = Σ sổ cái.

## Risk assessment
- Khuyến mãi phức tạp làm POS chậm ⇒ giới hạn số khuyến mãi đang chạy/chi nhánh, đo thời gian evaluate.

## Security considerations
- SĐT khách là dữ liệu cá nhân: phạm vi truy cập theo quyền, xuất/xóa theo yêu cầu khách (kiểm luật dữ liệu cá nhân).
- Nạp ví = tiền thật ⇒ cần quyền + đối soát ca.

## Next steps
- Phase 09 mở rộng phạm vi khuyến mãi theo thương hiệu/chi nhánh.
