---
title: Màn chỉ dành cho test, không mô tả trong sổ tay
screens: []
---

# Màn chỉ dành cho test

Danh sách các màn trong `apps/pos/test/browser/pages/screen-names.ts` mà sổ tay **không** mô tả, kèm lý do. Test `scripts/src/docs-shots/pos-handbook-covers-every-screen.test.ts` đọc mục `screens` ở đầu file này: mỗi màn của máy quầy phải nằm trong `screens` của **đúng một** file sổ tay, hoặc ở đây.

Hiện **không có màn nào** chỉ dành cho test. Ba màn trông như biến thể của test đều là trạng thái thật của màn bán, nên được mô tả trong [03-ban-tai-quay.md](03-ban-tai-quay.md):

| Màn | Vì sao vẫn mô tả |
|---|---|
| `sale-photos` | màn bán khi món có ảnh (và ảnh lỗi) — mục "Ảnh món" |
| `modifier-picker-photo` | màn chọn tùy chọn khi món có ảnh |
| `sale-long-cart` | màn bán với đơn dài: cột đơn cuộn, tổng tiền và nút Thanh toán đứng yên ở dưới |

Khi thêm một màn chỉ để test (ví dụ màn dựng riêng để đo bố cục), ghi tên màn vào `screens` ở đầu file này và thêm một dòng lý do vào bảng.
