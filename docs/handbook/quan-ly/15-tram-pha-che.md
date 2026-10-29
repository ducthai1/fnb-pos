---
title: Trạm pha chế/bếp — thêm, đổi tên, xóa trạm của chi nhánh
audience: quan-ly
screens:
  - /menu/stations
decisions:
  - D-118
tests:
  - apps/backoffice/src/components/menu/stations-screen.test.tsx
  - apps/api/test/integration/catalog/catalog-categories-and-stations.test.ts
  - apps/api/test/integration/catalog/catalog-writes-need-edit-menu.test.ts
  - packages/domain/src/kitchen/diff-kitchen-ticket.test.ts
  - e2e/backoffice/manage-stations.spec.ts
---

# Trạm pha chế/bếp — thêm, đổi tên, xóa trạm của chi nhánh

## Dùng để làm gì

**Trạm** là nơi một món được làm ở chi nhánh: **Bar**, **Bếp nóng**, **Quầy bánh**… Khi thu ngân bấm gửi bếp, mỗi trạm nhận một phiếu riêng chỉ có món của nó. Trang này khai báo danh sách trạm của **chi nhánh đang xem**; việc **gán món cho trạm** làm ở ô **Trạm pha chế/bếp** của [trang sửa món](03-thuc-don.md).

## Ai dùng, cần quyền gì

- Xem: ai đăng nhập cũng xem được.
- Thêm, đổi tên, xóa trạm: cần quyền **Sửa menu**.

## Các bước

![Trạm pha chế/bếp](../images/quan-ly/tram-pha-che.webp)

1. Chọn chi nhánh ở thanh trên, mở **Thực đơn → Trạm pha chế**.
2. Gõ tên ở **Trạm mới**, bấm **Thêm trạm**. Bấm khi ô còn trống thì dòng đỏ "Nhập tên." hiện dưới ô.
3. **Đổi tên**: bấm **Đổi tên** ở dòng, gõ tên mới, bấm **Lưu** (hoặc **Hủy**). Phiếu in từ lần sau mang tên mới.
4. **Xóa**: bấm **Xóa** ở dòng, xác nhận **Xóa**.
5. Sang trang sửa món, chọn trạm ở ô **Trạm pha chế/bếp (chi nhánh đang xem)** cho từng món.

## Luật và giới hạn

- Trạm thuộc **một chi nhánh**; chi nhánh khác có danh sách trạm riêng. Tên tối đa **120 ký tự**.
- **Món chưa gán trạm thì không in phiếu bếp**, và món gán cho một trạm của chi nhánh khác cũng không in ở chi nhánh này. Vì vậy máy chủ **không cho xóa trạm còn món gán cho nó**: xóa sẽ làm các món ấy mất phiếu.
- Trạm **đã từng in phiếu bếp** cũng không xóa được (lịch sử phiếu còn trỏ tới nó); muốn dùng tên khác thì **đổi tên**.
- Thêm, đổi tên, xóa tới mọi máy quầy của chi nhánh ở lần đồng bộ kế tiếp.
- Hai người sửa cùng một trạm: người lưu sau bị từ chối, trang tải lại danh sách và báo "Có người đã sửa trạm này trước bạn."

## Khi có lỗi

| Màn hình báo | Làm gì |
|---|---|
| Nhập tên. / Tên dài tối đa 120 ký tự. | Sửa tên |
| Chưa xóa được: trạm này còn món gán cho nó hoặc đã từng in phiếu bếp. Chuyển các món sang trạm khác ở trang sửa món; trạm đã từng in phiếu thì giữ lại và đổi tên nếu cần. | Gán các món sang trạm khác rồi xóa lại, hoặc đổi tên |
| Có người đã sửa trạm này trước bạn. Danh sách đã được tải lại. | Sửa lại trên danh sách mới |
| Không tìm thấy trạm pha chế/bếp này. Tải lại trang. | Tải lại trang |
| Vai trò của bạn không có quyền làm việc này. Nhờ chủ quán cấp quyền. | Cần quyền Sửa menu |

## Mất mạng thì sao

Trang quản lý cần mạng để lưu. Máy quầy đang mất mạng vẫn in phiếu theo trạm đã nhận; thay đổi tới khi máy có mạng lại.

## Chưa làm / sắp có

- Chưa có **lưu trữ** trạm: trạm đã từng in phiếu ở lại danh sách mãi (đổi tên được).
- Chưa gán **máy in** cho trạm trên trang quản lý; việc đó nằm ở thiết lập máy quầy.
- Món là của cả thương hiệu nhưng trạm là của từng chi nhánh: một món chỉ gán được một trạm, nên ở chi nhánh khác món đó không in phiếu cho tới khi có cách gán trạm theo chi nhánh.
