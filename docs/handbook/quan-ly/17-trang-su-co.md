---
title: Trang sự cố của trang quản lý
audience:
  - chu-quan
  - quan-ly
screens: []
decisions:
  - D-122
tests:
  - apps/backoffice/src/components/shell/crash-page.test.tsx
  - apps/backoffice/src/lib/client-errors/backoffice-reporter.test.ts
  - apps/api/test/integration/client-errors/clients-report-their-faults.test.ts
---

# Trang sự cố của trang quản lý

## Dùng để làm gì

Khi một trang quản lý gặp lỗi không lường trước và không vẽ được, thay vì màn trắng, trang hiện khung **"Trang gặp sự cố"** với hai nút **Thử lại** và **Về trang chủ**. Thanh trên cùng và menu vẫn ở nguyên khi lỗi nằm trong một trang đã đăng nhập, nên bấm sang trang khác được ngay. Lỗi được ghi lại cho người vận hành (không kèm tên ai).

## Ai dùng, cần quyền gì

Bất kỳ ai dùng trang quản lý; không cần quyền riêng. Lỗi chỉ gửi lên máy chủ khi đã đăng nhập.

## Các bước

1. Thấy "Trang gặp sự cố": bấm **Thử lại** để vẽ lại trang.
2. Chưa được: bấm **Về trang chủ** hoặc chọn một mục khác trên menu.
3. Lặp lại nhiều lần: báo người hỗ trợ kèm giờ xảy ra và tên trang.

## Luật và giới hạn

- Dữ liệu của quán nằm trên máy chủ, lỗi hiển thị không làm mất gì.
- Lỗi chờ gửi tối đa **50**, cùng lỗi lặp lại trong **60 giây** tính một lần, quá **24 giờ** thì bỏ. Lỗi xảy ra trước khi đăng nhập (ví dụ ở trang đăng nhập) được giữ trong thẻ trình duyệt và gửi sau khi đăng nhập.
- Máy chủ che email, số điện thoại, dãy số dài, mã đăng nhập; bỏ phần sau `?` và `#` của địa chỉ; thông báo tối đa 500 ký tự, dấu vết 4 KB; nhật ký chỉ ghi mã cửa hàng và mã tài khoản.

## Khi có lỗi

| Thấy gì | Làm gì |
|---|---|
| "Trang gặp sự cố" — "Trang này vừa gặp lỗi nên không hiển thị được. Dữ liệu của quán vẫn an toàn trên máy chủ." | **Thử lại**, hoặc **Về trang chủ** |
| "Nếu lỗi lặp lại, báo cho người hỗ trợ kèm giờ xảy ra." | Ghi lại giờ và tên trang rồi báo |

## Mất mạng thì sao

Khung sự cố hiện không cần mạng. Lỗi được giữ trong thẻ trình duyệt đang mở và gửi khi có mạng lại; đóng thẻ trước đó thì lỗi chưa gửi mất.

## Chưa làm / sắp có

- Chưa có trang xem danh sách lỗi trong trang quản lý: hiện đọc nhật ký máy chủ ([Nhật ký lỗi](../van-hanh/05-nhat-ky-loi-may-quay-va-trang-quan-ly.md)).
