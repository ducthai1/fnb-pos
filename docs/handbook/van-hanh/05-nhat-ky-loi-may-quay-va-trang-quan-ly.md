---
title: Nhật ký lỗi từ máy quầy và trang quản lý
audience: van-hanh
screens: []
decisions:
  - D-064
  - D-122
tests:
  - apps/api/src/client-errors/scrub-client-error.test.ts
  - apps/api/test/integration/client-errors/clients-report-their-faults.test.ts
  - packages/contracts/src/client-errors/client-error-report-schema.test.ts
  - apps/pos/src/features/client-errors/client-error-reporter.test.ts
  - apps/backoffice/src/lib/client-errors/backoffice-reporter.test.ts
---

# Nhật ký lỗi từ máy quầy và trang quản lý

## Dùng để làm gì

Biết máy quầy hay trang quản lý nào đang gặp lỗi mà không phải chờ người dùng gọi. Lỗi của trình duyệt (màn không vẽ được, lỗi không bắt, lời hứa bị từ chối) được gửi về **máy chủ của chính quán**, ghi vào cùng nhật ký với lỗi 500 của API. Không có dịch vụ bên ngoài nào được gọi và không có dữ liệu nào rời khỏi server.

## Ai dùng, cần quyền gì

Người vận hành, có quyền đọc `journalctl` trên server.

## Các bước

1. Xem lỗi vừa về: `journalctl -u fnb-api --since "1 hour ago" | grep "client error"`.
2. Mỗi lỗi một dòng đầu, theo sau là các dòng dấu vết (`at …`):
   `client error: pos 0.0.0+abc1234 render tenant=<mã cửa hàng> device=<mã máy> route=/pos/ at=<giờ UTC>: <thông báo>`
   Với trang quản lý: `client error: backoffice … account=<mã tài khoản>` thay cho `device=`.
3. `pos`/`backoffice` là ứng dụng; số sau là bản đang chạy (đối chiếu với `version.json` của bản cài); `kind` là `error` (lỗi không bắt), `unhandled_rejection` hoặc `render` (màn không vẽ được).
4. Tra mã máy ở trang [Thiết bị](../quan-ly/07-thiet-bi.md) (6 ký tự cuối mã máy) để biết máy nào.

## Luật và giới hạn

- Đường nhận: `POST /client-errors`, một lô **1–20** lỗi `{app, appVersion, occurredAt, kind, message, stack?, route?}`. Cần **máy quầy đã ghép** (`Authorization: Device …`) hoặc **phiên đăng nhập trang quản lý**; không có thì 401. Lô rỗng, quá 20 lỗi hoặc sai dạng ⇒ 400.
- Trả **204** khi nhận, để máy khách không thử lại dồn dập. Vượt giới hạn ⇒ 429 `API_RATE_LIMITED`; giới hạn là của các đường máy quầy (mặc định 300/phút theo địa chỉ, 60/phút theo mỗi máy hoặc mỗi phiên; đổi bằng `FNB_RATE_LIMIT_TILL_PER_ADDRESS`, `FNB_RATE_LIMIT_TILL_PER_DEVICE`).
- Máy chủ **che** trước khi ghi: bỏ chuỗi truy vấn và `#…` của địa chỉ và route; thay email, số điện thoại, dãy từ 9 chữ số, mã kiểu JWT bằng `[email]`, `[number]`, `[token]`; che mật khẩu/mã đăng nhập/Bearer. Thông báo cắt ở **500** ký tự, dấu vết ở **4 KB**.
- Chỉ ghi **mã** cửa hàng, máy, tài khoản — không ghi tên nhân viên, tên khách, nội dung đơn.
- Phía máy khách: hàng chờ tối đa 50 lỗi, cùng lỗi trong 60 giây tính một, quá 24 giờ thì bỏ; lỗi chưa gửi được (chưa ghép máy, chưa đăng nhập, mất mạng) giữ lại và gửi sau.

## Khi có lỗi

| Thấy gì | Nghĩa là | Làm gì |
|---|---|---|
| Không có dòng `client error` nào dù máy báo sự cố | Máy chưa ghép, mất mạng, hoặc bị giới hạn 429 | Kiểm máy còn trong trang [Thiết bị](../quan-ly/07-thiet-bi.md) và có mạng |
| Nhiều dòng giống nhau từ một máy | Một màn lỗi lặp | Báo lập trình viên kèm dòng đầu và dấu vết; tải lại máy đó |
| Dòng chỉ ghi `route=/pos/` | Máy quầy không có đường dẫn con | Bình thường |

## Chưa làm / sắp có

- Chưa có trang xem và gom lỗi theo loại; chưa có cảnh báo khi một lỗi tăng đột biến.
- Chưa có "nguồn bản đồ" (source map) để dấu vết của bản build đọc được tên hàm.
