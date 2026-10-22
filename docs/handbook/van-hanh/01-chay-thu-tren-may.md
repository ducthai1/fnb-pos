---
title: Chạy thử cả hệ thống trên một máy
audience: van-hanh
screens: []
decisions:
  - D-017
  - D-050
  - D-072
tests:
  - scripts/src/dev-stack/running-stack-claim.test.ts
  - scripts/src/dev-stack/seed/sample-photos.test.ts
  - scripts/src/bank-notice/sepay-dev-notice.test.ts
  - scripts/test/integration/seed-sample-shop-runs-twice.test.ts
---

# Chạy thử cả hệ thống trên một máy

## Dùng để làm gì

Dựng **toàn bộ hệ thống** (cơ sở dữ liệu, máy chủ API, máy quầy POS, trang quản lý) trên một máy tính, với **quán mẫu "Cà phê Mẫu"** có sẵn thực đơn có ảnh, sơ đồ bàn, nhân viên, tài khoản nhận tiền giả và hóa đơn điện tử giả — để chủ quán bấm thử, hoặc để kiểm một thay đổi trước khi đưa lên server.

Đây **không phải** cách chạy cho quán thật (xem [Đặt lên server](02-dat-len-server.md)).

## Ai dùng, cần quyền gì

Người có mã nguồn và Node ≥ 22, pnpm 10 trên máy (Linux hoặc macOS). Không cần Docker, không cần quyền quản trị máy: Postgres 17 chạy dạng nhúng.

## Các bước

1. Lần đầu: `pnpm install` ở thư mục gốc của mã nguồn.
2. Chạy:

   ```
   pnpm dev:stack
   ```

   Lần đầu mất vài phút (khởi động Postgres, chạy migration, dựng quán mẫu qua đúng các API trang quản lý dùng, rồi bật API, POS, trang quản lý).
3. Khi xong, lệnh in ra:
   - địa chỉ **Máy quầy (POS)**, **Backoffice**, **API** (`…/health`) và cổng Postgres;
   - **email + mật khẩu chủ quán** để đăng nhập trang quản lý;
   - **PIN** của ba nhân viên mẫu: Lan (Thu ngân), Minh (Pha chế), Hùng (Quản lý ca);
   - **mã ghép máy quầy** mới (dùng một lần, hết hạn sau 10 phút) và **đường link ghép một lần bấm** `http://127.0.0.1:5173/?pair=ABCD-EFGH` (cổng theo địa chỉ POS lệnh in ra): mở link là máy quầy tự điền mã, tự ghép và xóa mã khỏi thanh địa chỉ;
   - dòng **Xem nhanh các màn mẫu (không phải luồng thật)** `http://127.0.0.1:5173/test/docs-shots/docs-screens.html?screen=sale-photos`: các màn dựng bằng dữ liệu mẫu để chụp sổ tay, bấm vào không bán được — muốn thử thật thì dùng link ghép máy ở trên;
   - số món, số món có ảnh, số bàn.
4. Mở link ghép máy (hoặc mở địa chỉ POS rồi gõ mã ghép), chọn nhân viên, nhập PIN — bán thử. Mở địa chỉ Backoffice, đăng nhập bằng email chủ quán.
5. **Thử QR tự xác nhận**: trên POS chọn trả bằng chuyển khoản QR, đọc **mã nội dung** dưới mã QR (dạng `FNB…`), rồi ở cửa sổ khác chạy:

   ```
   pnpm dev:bank-notice <mã nội dung> <số tiền>
   ```

   Lệnh gửi một thông báo "đã nhận tiền" giống hệt cổng SePay gửi (có chữ ký bằng bí mật webhook của quán mẫu) tới API đang chạy; POS tự chuyển sang đã thanh toán.
6. Dừng: **Ctrl+C** một lần (đợi một chút, trang quản lý dừng chậm); Ctrl+C lần nữa để buộc dừng ngay.
7. Làm lại từ đầu (xóa hết dữ liệu thử): `pnpm dev:stack --reset`.

## Luật và giới hạn

- Cổng ưu tiên: Postgres **54329**, API **4300**, POS **5173**, trang quản lý **3300**. Cổng nào đang bận thì tự chọn cổng trống khác — luôn đọc địa chỉ lệnh in ra.
- Dữ liệu giữ trong `tmp/dev-stack/` (cơ sở dữ liệu, mật khẩu sinh ngẫu nhiên trong `credentials.json`) và ảnh món trong `tmp/media/` giữa các lần chạy. Chạy lại không tạo trùng gì, chỉ sinh **mã ghép mới**.
- Chỉ **một** `pnpm dev:stack` chạy một lúc: lần chạy thứ hai bị từ chối và in PID của lần đang chạy.
- Mất `credentials.json` mà còn dữ liệu cũ ⇒ lệnh dừng và bảo chạy `--reset`.
- Mật khẩu, PIN, khóa thanh toán ở đây là **ngẫu nhiên của riêng máy này**, không dùng cho server thật. Tài khoản ngân hàng và nhà cung cấp hóa đơn là giả: không có tiền thật, không có hóa đơn thật.
- Trang quản lý chạy ở chế độ phát triển (`next dev`): lần đầu mở mỗi trang chậm vài giây.
- Ở chế độ chạy thử **không có giới hạn tần suất** đăng nhập (giới hạn chỉ bật khi chạy như server thật).

## Ảnh của sổ tay

Ảnh trong phần quản lý của sổ tay được chụp tự động từ quán mẫu, trên một bộ máy riêng (Postgres tạm, cổng trống, bản build trang quản lý), không đụng tới `pnpm dev:stack` đang chạy:

```
pnpm docs:shots:backoffice
```

Ảnh ghi vào `docs/handbook/images/quan-ly/` (WebP, mỗi ảnh ≤ 150 KB, khổ 1280 và 360). Lệnh dùng Chrome của máy (`/usr/bin/google-chrome`, hoặc biến `FNB_CHROME_PATH`) và tự bán 12 đơn mẫu để các trang báo cáo có số liệu.

## Khi có lỗi

| Lệnh báo | Làm gì |
|---|---|
| Một pnpm dev:stack khác đang chạy hoặc đang khởi động (PID …). | Dừng cái đang chạy (Ctrl+C ở cửa sổ đó, hoặc `kill <PID>`) |
| tmp/dev-stack còn dữ liệu cũ nhưng mất credentials.json: chạy pnpm dev:stack --reset | Chạy `pnpm dev:stack --reset` |
| Postgres không khởi động được: … | Đọc các dòng log in kèm; thường do ổ đầy hoặc thư mục dữ liệu hỏng ⇒ `--reset` |
| … đã dừng bất ngờ (…): dừng cả hệ thống. | Một phần (API/POS/trang quản lý) chết; đọc log phía trên, sửa rồi chạy lại |
| Cách dùng: pnpm dev:bank-notice <mã nội dung, vd FNB7K2M9QXA> <số tiền, vd 64000> | Thiếu tham số |

## Chưa làm / sắp có

- Chưa có lệnh giả lập thông báo của PayOS (chỉ SePay).
