# Phase 10 — Khách tự gọi món bằng QR, kênh app giao hàng

## Context links
- [catalog §5 đơn QR, §19 kênh giao hàng](logic-catalog-flows-rules-and-design-decisions.md)
- [research D3](research/research-d-hoa-don-dien-tu-vietqr-giao-hang-offline-in-an.md) · [research F11 self-order](research/research-f-odoo-pos-18-luat-chinh-xac-tu-ma-nguon.md)

## Overview
- Ưu tiên: P2 (R3). Phụ thuộc: R1 (QR quầy), 06 (QR theo bàn). Ước lượng: 4–6 tuần-người (chưa tính API GrabFood).

## Key insights
- Odoo self-order: quầy ⇒ bắt buộc trả trước; bàn ⇒ trả sau theo bữa hoặc theo món; server tính lại giá.
- GrabFood có API đối tác chính thức (menu, bật/tắt món, nhận đơn, chuẩn bị/hủy/hoàn, tạm đóng); ShopeeFood chỉ qua đối tác; Be chưa có thông tin.
- Nhận đơn từ kênh phải qua cloud, không phụ thuộc máy quầy đang mở.

## Requirements
- Functional:
  - QR theo bàn / QR quầy / kiosk: chế độ `menu_only | order_pay_later | order_pay_first`; trả trước bằng VietQR (phase 05); đơn vào hàng "chờ xác nhận" hoặc tự gửi bếp theo cờ.
  - Menu khách xem: ảnh, mô tả, hết món theo thời gian thực, tùy chọn như POS.
  - Kênh giao hàng (bước 1): đơn app nhập tay ở POS như kênh riêng, giá theo kênh, phí/hoa hồng theo kênh, đối soát.
  - Kênh giao hàng (bước 2, khi có tư cách đối tác): GrabFood API — đồng bộ menu + giá + hết món, nhận đơn qua webhook, chuẩn bị/hủy, tạm đóng cửa hàng.
  - ShopeeFood/Be: qua đối tác tích hợp hoặc chờ API.
- Non-functional: trang khách tải < 2s trên 4G; chống spam đơn ảo (giới hạn theo bàn/phiên, xác nhận của nhân viên).

## Architecture
- `apps/qr-order`: SPA nhẹ, đọc menu từ API công khai theo chi nhánh (cache CDN), tạo đơn qua API có rate-limit.
- `apps/api/channels/*`: `sales_channel`, `channel_order(external_id unique)`, `channel_menu`; adapter `DeliveryChannel { pushMenu, setAvailability, acceptOrder, markReady, cancel }`.

## Related code files
- Tạo: `apps/qr-order/*`, `apps/api/{qr-order,channels}/*`, `packages/db/schema/channel.ts`, POS: hàng "đơn chờ xác nhận", nguồn đơn theo kênh.

## Implementation steps
1. QR quầy trả trước.
2. QR bàn trả sau.
3. Kênh giao hàng nhập tay + đối soát phí.
4. Xin tư cách đối tác GrabFood (việc kinh doanh, bắt đầu sớm vì mất thời gian).
5. Adapter GrabFood.

## Todo list
- [ ] QR quầy trả trước
- [ ] QR bàn trả sau
- [ ] Kênh nhập tay + đối soát
- [ ] Hồ sơ đối tác GrabFood
- [ ] Adapter GrabFood

## Success criteria
- 1 tuần QR tại quán thí điểm: không đơn ảo lọt vào bếp; đơn app giao hàng đối soát khớp sao kê của kênh.

## Risk assessment
- Không được cấp tư cách đối tác ⇒ dừng ở bước nhập tay hoặc đi qua đối tác tích hợp.

## Security considerations
- API công khai: rate-limit, chống sửa giá từ client, token phiên theo bàn.

## Next steps
- Phase 11.
