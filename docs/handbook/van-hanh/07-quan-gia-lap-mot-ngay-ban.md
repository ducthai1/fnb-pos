---
title: Quán giả lập một ngày bán (công cụ cho người làm phần mềm)
audience: van-hanh
screens: []
decisions:
  - D-148
  - D-149
  - D-150
tests:
  - packages/sync-client/test/scenarios/simulated-shop-day.test.ts
---

# Quán giả lập một ngày bán

## Dùng để làm gì

Mô phỏng **nguyên một ngày bán của một quán nhiều máy** rồi **tự kiểm sổ cuối ngày**. Không dành cho thu ngân hay chủ quán: đây là công cụ của người sửa code, chạy trước khi gộp một thay đổi đụng tới đồng bộ, đơn, tiền, ca hay chốt ngày.

Quán giả lập có 4 máy ảo của một chi nhánh, chạy **đúng `@fnb/sync-client` và máy chủ API thật** trên cơ sở dữ liệu nhúng (không Docker, không trình duyệt):

| Máy | Làm gì |
|---|---|
| `counter-1`, `counter-2` | Hai máy quầy: bán mang đi, thu tiền mặt hoặc QR, giảm giá, hủy đơn, hoàn tiền, rút tiền ra khỏi két, đếm két và đóng ca. |
| `handheld` | Máy order bàn: mở bàn, thêm món, gửi pha chế, hủy món đã gửi, chuyển bàn, in tạm tính rồi giao bàn cho quầy thu. |
| `bar` | Máy pha chế. **Hệ thống chưa có loại máy riêng cho trạm** (trạm là danh mục, phiếu pha chế nằm trong lệnh của máy order), nên đây là một máy quầy chỉ nhận dữ liệu; nó vẫn phải khớp máy chủ cuối ngày. |

Cả ngày chạy trên **đồng hồ ảo** (máy chủ và các máy dùng chung một đồng hồ, mỗi máy có thể lệch giờ): ngày ngắn mất vài giây, ngày đầy đủ (07:00 đến 22:00) chừng 20 giây.

## Một ngày diễn ra thế nào

Mở ca (két 500.000 ₫) → sáng vắng → **trưa cao điểm 11:30–13:30** → chiều thưa → hết giờ nhận khách → mọi khách được phục vụ hoặc bỏ về → đếm két, đóng ca → các máy đồng bộ hết → chốt ngày.

Khách và món sinh **ngẫu nhiên có seed**: tên món, số lượng (có cả đơn 20–60 ly), ghi chú dài, ký tự lạ, giảm 10%, khách đổi ý bỏ về, hủy món đã gửi pha chế, chuyển bàn, hoàn tiền mặt, thanh toán QR có **báo có trễ** (vài phút sau khi hiện mã; có khách không chịu trả QR nên thu ngân gỡ mã và lấy tiền mặt).

## Sự cố được bơm vào ngày

| Sự cố | Chỗ trong ngày |
|---|---|
| Một máy **mất mạng 20 phút** giữa cao điểm; máy vẫn bán và ghi lệnh, nối lại thì gửi hết | ~42% |
| **Hai máy cùng thêm món vào một bàn** trước khi kịp đồng bộ | ~38% |
| Một máy **lệch giờ** (nhanh hoặc chậm tới 8 phút) cả ngày | từ đầu |
| **Máy chủ khởi động lại** giữa giờ | ~55% |
| **Cập nhật app giữa ca**: máy chủ đòi bản tối thiểu mới (426), lệnh nằm lại, từng máy tải lại bản mới rồi gửi tiếp | ~72% |

Máy bị từ chối vì bàn đã có người sửa (`SYNC_ORDER_VERSION_STALE`) thì làm như app: lấy lệnh ra khỏi "Cần xử lý" rồi lưu lại phần món mình thêm lên bản mới của máy chủ. Phiên nhân viên hết hạn thì thu ngân nhập PIN lại.

## Cuối ngày tự kiểm

Mỗi mục là một lời khẳng định có câu báo rõ; **tất cả cái sai được gom lại**, không dừng ở cái đầu tiên:

1. Không mất, không trùng, không thừa đơn: mọi đơn quán đã làm có trên máy chủ đúng một lần, và máy chủ không có đơn nào quán chưa làm.
2. Mỗi đơn kết thúc đúng như quán kết thúc (trả / hủy), đúng ngày kinh doanh, có **đúng một khoản thu** khớp phương thức và số tiền, đủ món và số lượng (kể cả món đã hủy bớt); hoàn tiền trả đúng số.
3. Mỗi lệnh đi **đúng một lần**: số lệnh quán phát ra = số lệnh máy chủ nhận; không lệnh nào kẹt trong hàng chờ của máy; "Cần xử lý" chỉ chứa lệnh kịch bản cố ý để bị từ chối.
4. Mọi máy **hiển thị y hệt máy chủ** (từng đơn, từng ca; so sâu từng trường).
5. **Két mỗi ca khớp**: số tiền thu ngân đếm theo sổ của quán (đầu ca + thu − hoàn − rút) bằng số hệ thống chờ đợi, chênh 0.
6. **Số gọi** không trùng giữa các máy cùng chi nhánh.
7. Báo cáo ngày và chốt ngày khớp tổng các dòng (xem phần "Báo cáo" bên dưới nếu có).

## Cách chạy

```bash
# nhanh, như cổng CI: hai seed ngày ngắn (10:00–15:00), cùng bộ pnpm test:sync
pnpm test:sync

# chạy tay: một seed, một ngày ngắn
pnpm sim:day --seed 7

# nhiều seed, nhiều ngày liền (máy giữ nguyên dữ liệu qua đêm), ngày đầy đủ
pnpm sim:day --seeds 1-20
pnpm sim:day --seed 7 --days 3 --full
```

`--seed 3,9` chạy hai seed; `--seeds 1-20` chạy hai mươi seed. Mỗi seed in một dòng `seed N day D: {…}` (số đơn, số lệnh, số lệnh bị từ chối) và các sự cố đã xảy ra.

## Đọc kết quả và tái hiện

Hỏng thì bài kiểm in **mọi** chỗ lệch kèm dòng `replay with: pnpm sim:day --seed N --days D [--full]`. Chạy lại đúng lệnh đó ra đúng ngày đó (hạt giống quyết định khách, món, sự cố, lỗi mạng); thứ không tất định là mã định danh đơn (mỗi lần mỗi khác) và thời gian thực của máy chủ.

Hai lỗi gặp khi dựng nằm ở "Việc phát sinh" của bảng task, kèm seed.

## Chưa làm

- Chưa có Chrome chạy giao diện máy quầy thật (tầng sau của quán giả lập).
- Chưa có duyệt của quản lý: cả bốn máy đăng nhập bằng một **quản lý** (được giảm giá, hoàn tiền, hủy món đã gửi không cần người thứ hai). Luồng duyệt có test riêng.
- Không có combo, món cân, món giá nhập tay, phí phục vụ, thuế khác 8%.
