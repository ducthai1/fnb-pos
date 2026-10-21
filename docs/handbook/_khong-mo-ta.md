# Màn không mô tả trong sổ tay

Mỗi màn của máy quầy (`apps/pos/test/browser/pages/screen-names.ts`) và mỗi trang của trang quản lý (`apps/backoffice/src/app/**/page.tsx` + menu `ADMIN_SECTIONS`) phải nằm trong `screens` của **đúng một** trang sổ tay, hoặc có một dòng trong bảng dưới đây kèm lý do. Test `scripts/src/handbook/handbook-coverage.test.ts` đọc cột đầu của bảng (tên màn trong dấu `` ` ``).

Hiện **không có màn nào** bị bỏ. Ba màn trông như biến thể dành cho test thật ra là trạng thái thật của màn bán, nên được mô tả ở [máy quầy · bán tại quầy](may-quay/03-ban-tai-quay.md): màn bán khi món có ảnh (`sale-photos`, cả ảnh lỗi), màn chọn tùy chọn khi món có ảnh (`modifier-picker-photo`), màn bán với đơn dài (`sale-long-cart`: cột đơn cuộn, tổng tiền và nút Thanh toán đứng yên ở dưới).

Khi cố ý không mô tả một màn (ví dụ màn dựng riêng để đo bố cục), thêm một dòng:

| Màn | Vì sao không mô tả |
|---|---|
