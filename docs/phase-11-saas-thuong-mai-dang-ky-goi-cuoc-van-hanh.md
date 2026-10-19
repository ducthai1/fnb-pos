# Phase 11 — SaaS thương mại: đăng ký, gói cước, thu phí, onboarding, vận hành

## Context links
- [architecture §8 đa tenant & bảo mật](architecture-and-stack-decision.md)
- [catalog §21 mẫu loại quán](logic-catalog-flows-rules-and-design-decisions.md)

## Overview
- Ưu tiên: P1 với phần vận hành (bắt đầu trước R1), P2 với phần bán hàng (R4). Ước lượng: 4–6 tuần-người.
- Từ "một quán thí điểm do mình dựng tay" tới "chủ quán lạ tự đăng ký và dùng được".

## Key insights
- Mẫu loại quán (phase 03) là phần lớn của onboarding.
- Hóa đơn điện tử + máy in là hai chỗ chủ quán hay kẹt khi tự cài ⇒ cần hướng dẫn từng bước + kiểm tra kết nối tự động.

## Requirements
- Functional:
  - Tự đăng ký: SĐT + OTP → tạo tổ chức → chọn loại quán → dựng menu mẫu → ghép thiết bị → in thử → bán đơn đầu tiên.
  - Gói cước theo số chi nhánh/thiết bị/tính năng; dùng thử N ngày; thu phí định kỳ (VietQR/chuyển khoản, xuất hóa đơn cho khách SaaS); khóa mềm khi quá hạn (vẫn xem/xuất dữ liệu, không bán).
  - Trang quản trị nội bộ: tenant, gói, hỗ trợ (xem với sự đồng ý của khách, có ghi log).
  - Xuất toàn bộ dữ liệu của tenant; xóa tenant theo yêu cầu.
  - Trung tâm trợ giúp + video ngắn từng thao tác.
- Non-functional (vận hành, bắt đầu **trước R1**):
  - Giám sát lỗi (client + server), log có tenant_id, cảnh báo: webhook lỗi, hóa đơn chưa gửi, lệnh sync bị từ chối tồn đọng, máy in lỗi.
  - Backup Postgres tự động + diễn tập khôi phục; RPO ≤ 15 phút.
  - Cập nhật app quầy: web bundle cập nhật nóng trong vỏ native, chặn cập nhật giữa ca, cho quay lui.
  - Môi trường staging với dữ liệu giả có tên xấu (dài, ký tự lạ).

## Architecture
- Schema: `plan, subscription, invoice_saas, usage_counter, support_access_grant`.
- Feature flags theo gói dùng chung `packages/feature-flags` (phase 01).

## Related code files
- Tạo: `apps/api/{billing,signup,admin}/*`, `apps/backoffice/app/(onboarding,billing)/*`, `apps/admin` (nội bộ), `infra/*` (IaC, backup, giám sát).

## Implementation steps
1. (Trước R1) Giám sát, backup, staging, cập nhật app quầy.
2. Onboarding tự phục vụ + kiểm tra máy in/HĐĐT tự động.
3. Gói cước + dùng thử + thu phí + khóa mềm.
4. Quản trị nội bộ + quyền hỗ trợ có đồng ý.
5. Xuất/xóa dữ liệu tenant.
6. Trợ giúp + video.

## Todo list
- [ ] Giám sát, backup, staging, cập nhật app (trước R1)
- [ ] Onboarding tự phục vụ
- [ ] Gói cước, dùng thử, thu phí, khóa mềm
- [ ] Quản trị nội bộ + hỗ trợ có đồng ý
- [ ] Xuất/xóa dữ liệu
- [ ] Trợ giúp

## Success criteria
- Một chủ quán chưa từng gặp đội tự đăng ký và bán được đơn đầu tiên (có in bill) trong < 60 phút, không cần gọi hỗ trợ.

## Risk assessment
- Chi phí hỗ trợ cài máy in vượt doanh thu gói ⇒ danh sách máy in được hỗ trợ chính thức + bán kèm thiết bị đã kiểm.

## Security considerations
- Truy cập hỗ trợ chỉ khi khách cấp quyền, có hạn, ghi log.
- Tách quyền nội bộ (kỹ thuật/kinh doanh/hỗ trợ).
- Kiểm yêu cầu pháp lý về dữ liệu cá nhân và nơi đặt máy chủ trước khi mở bán.

## Next steps
- Sau R4: lương/hoa hồng, FIFO/FEFO, menu theo khung giờ, tính tiền theo giờ, API mở cho đối tác (catalog §22).
