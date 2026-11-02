---
title: Quán giả lập một ngày bán (công cụ cho người làm phần mềm)
audience: van-hanh
screens: []
decisions:
  - D-148
  - D-149
  - D-150
  - D-159
  - D-160
  - D-161
  - D-164
tests:
  - packages/sync-client/test/scenarios/simulated-shop-day.test.ts
---

# Quán giả lập một ngày bán

## Dùng để làm gì

Mô phỏng **nguyên một ngày bán của một quán nhiều máy** rồi **tự kiểm sổ cuối ngày**. Không dành cho thu ngân hay chủ quán: đây là công cụ của người sửa code, chạy trước khi gộp một thay đổi đụng tới đồng bộ, đơn, tiền, ca hay chốt ngày.

Quán giả lập có 4 máy ảo của một chi nhánh, chạy **đúng `@fnb/sync-client` và máy chủ API thật** trên cơ sở dữ liệu nhúng (không Docker, không trình duyệt):

| Máy | Làm gì |
|---|---|
| `counter-1`, `counter-2` | Hai máy quầy (`counter-1` đứng bằng **quản lý**, `counter-2` bằng **thu ngân** thường): bán mang đi, thu tiền mặt hoặc QR, giảm giá, hủy đơn, hoàn tiền, rút tiền ra khỏi két, đếm két và đóng ca. |
| `handheld` | Máy order bàn, đứng bằng **thu ngân** thường: mở bàn, thêm món, gửi pha chế, hủy món đã gửi, chuyển bàn, in tạm tính rồi giao bàn cho quầy thu. |
| `bar` | Máy pha chế. **Hệ thống chưa có loại máy riêng cho trạm** (trạm là danh mục, phiếu pha chế nằm trong lệnh của máy order), nên đây là một máy quầy chỉ nhận dữ liệu; nó vẫn phải khớp máy chủ cuối ngày. |

Cả ngày chạy trên **đồng hồ ảo** (máy chủ và các máy dùng chung một đồng hồ, mỗi máy có thể lệch giờ): ngày ngắn mất vài giây, ngày đầy đủ (07:00 đến 22:00) chừng 20 giây.

Lệnh lưu bàn bị máy chủ từ chối vì máy khác sửa bàn trước được **làm lại bằng đúng hàm của máy quầy** (không chép logic), kể cả phiếu bar đã in và được ghi lại sau đó; nên người order bàn không phải chờ máy chủ nhận món rồi mới gửi pha chế như trước.

## Ai dùng, cần quyền gì

Người làm phần mềm, trên máy dev: không cần tài khoản hay quyền gì của quán (mọi thứ chạy trên cơ sở dữ liệu nhúng của bài kiểm). Thu ngân, quản lý và chủ quán không dùng trang này.

## Một ngày diễn ra thế nào

Mở ca (két 500.000 ₫) → sáng vắng → **trưa cao điểm 11:30–13:30** → chiều thưa → hết giờ nhận khách → mọi khách được phục vụ hoặc bỏ về → đếm két, đóng ca → các máy đồng bộ hết → chốt ngày.

Khách và món sinh **ngẫu nhiên có seed**: tên món, số lượng (có cả đơn 20–60 ly), ghi chú dài, ký tự lạ, giảm 10%, khách đổi ý bỏ về, hủy món đã gửi pha chế, chuyển bàn, hoàn tiền mặt, thanh toán QR có **báo có trễ** (vài phút sau khi hiện mã; có khách không chịu trả QR nên thu ngân gỡ mã và lấy tiền mặt).

## Luật và giới hạn

### Sự cố được bơm vào ngày

| Sự cố | Chỗ trong ngày |
|---|---|
| Một máy **mất mạng 20 phút** giữa cao điểm; máy vẫn bán và ghi lệnh, nối lại thì gửi hết | ~42% |
| **Hai máy cùng thêm món vào một bàn** trước khi kịp đồng bộ | ~38% |
| Một máy **lệch giờ** (nhanh hoặc chậm tới 8 phút) cả ngày | từ đầu |
| **Máy chủ khởi động lại** giữa giờ | ~55% |
| **Cập nhật app giữa ca**: máy chủ đòi bản tối thiểu mới (426), lệnh nằm lại, từng máy tải lại bản mới rồi gửi tiếp | ~72% |
| **Máy quầy bị thu hồi khi còn giữ đơn chưa gửi**: máy quầy dự phòng `counter-3` được ghép, mở ca, mất mạng, bán tiền mặt; chủ quán thu hồi máy trên trang quản lý; thu ngân đếm két, đóng ca (vẫn mất mạng); có mạng lại máy thấy mình bị thu hồi; quản lý tạo **mã cho gửi nốt**; máy gửi nốt bằng đúng hàm của màn thu hồi (`flushOutboxUnderGrant`), rồi **ghép lại thành máy mới** (xóa dữ liệu như nút "Ghép lại máy"), mở ca mới và bán tiếp. Mỗi seed rơi vào một trong ba biến thể: **đứt giữa chừng** (52 đơn, lô 100 lệnh đầu lên, lô sau rớt mạng, gửi tiếp **cùng mã**); **mã hết hạn** (quản lý tới sau 11 phút, máy chủ trả 401, quản lý tạo mã mới); **bấm thanh toán hai lần** (lần hai bị từ chối, màn thu hồi ghi lệnh không được nhận **kèm số tiền**) | ~20% |
| **Món cân qua lần đổi đơn vị**: quản lý thêm "Bò khô xé (cân)" 450.000 ₫/kg; máy order bàn mở một bàn có 351 g, `counter-1` mở một bàn có 702 g rồi gửi pha chế; `counter-1` mất mạng (giữ thực đơn cũ "kg"); quản lý đổi món sang **100 g** (45.000 ₫/100 g) trên trang quản lý; `counter-1` (mất mạng) cân thêm **250 g theo kg** và **hủy bớt 0,351** của dòng đã gửi; máy order bàn (thực đơn mới) cân thêm **350 g = 3,5 × 100 g**; `counter-1` có mạng lại, thu cả hai bàn | ~46% |
| **Thu chi két quá hạn mức bị từ chối**: thu ngân `counter-2` rút 900.000 ₫ (quá 500.000 ₫ một ca) mà không xin duyệt như máy bản cũ → máy chủ từ chối, tiền chưa rời két; thu ngân thử **tự bỏ qua** (máy bản cũ cho bấm) → máy chủ từ chối tiếp; quản lý duyệt *Mở két không bán hàng* **cho đúng ca đó** → bỏ qua cả hai lệnh | ~30% |

Máy bị từ chối vì bàn đã có người sửa (`SYNC_ORDER_VERSION_STALE`) thì làm như app: lấy lệnh ra khỏi "Cần xử lý" rồi lưu lại phần món mình thêm lên bản mới của máy chủ; bản gộp bị từ chối nữa thì gộp lại tiếp, tối đa 3 lần (dòng kết quả in `refusedRedos`). Phiên nhân viên hết hạn thì thu ngân nhập PIN lại.

### Cuối ngày tự kiểm

Mỗi mục là một lời khẳng định có câu báo rõ; **tất cả cái sai được gom lại**, không dừng ở cái đầu tiên:

1. Không mất, không trùng, không thừa đơn: mọi đơn quán đã làm có trên máy chủ đúng một lần, và máy chủ không có đơn nào quán chưa làm.
2. Mỗi đơn kết thúc đúng như quán kết thúc (trả / hủy), đúng ngày kinh doanh, có **đúng một khoản thu** khớp phương thức và số tiền, đủ món và số lượng (kể cả món đã hủy bớt); hoàn tiền trả đúng số. **Món thu ngân đã bấm mà không có trên bill** chỉ được phép khi lệnh lưu của nó **còn nằm ở "Cần xử lý"** của một máy hoặc **đã bị bỏ qua có lý do** (nhật ký `sync.rejection_dismissed`); số đó in ở `missedTheBill` và được trừ khỏi số món báo cáo phải khớp. Ngoài hai chỗ đó, món mất là lỗi.
3. Mỗi lệnh đi **đúng một lần**: số lệnh quán phát ra = số lệnh máy chủ nhận; không lệnh nào kẹt trong hàng chờ của máy; "Cần xử lý" chỉ chứa lệnh kịch bản cố ý để bị từ chối.
4. Mọi máy **hiển thị y hệt máy chủ** (từng đơn, từng ca; so sâu từng trường).
5. **Két mỗi ca khớp**: số tiền thu ngân đếm theo sổ của quán (đầu ca + thu − hoàn − rút) bằng số hệ thống chờ đợi, chênh 0. Khoản thu chi két bị từ chối **không vào sổ két** (máy chủ không nhận lệnh nào của nó), chỉ được bỏ qua với **đúng một** dòng nhật ký gắn ca có tên người duyệt; lần thu ngân tự bỏ qua phải bị từ chối `SYNC_APPROVAL_…`.
6. **Số gọi** không trùng giữa các máy cùng chi nhánh.
7. **Máy bị thu hồi**: máy thấy mình bị thu hồi (`API_DEVICE_UNAUTHENTICATED`), gửi nốt thì hàng chờ về 0; **mỗi khoản tiền mặt máy đã thu** hoặc có trên máy chủ, hoặc nằm trong danh sách "không được nhận" của màn thu hồi **đúng số tiền**; lần bấm hai lần đi đúng chiều (lần đầu nhận, lần hai từ chối); số mã quản lý tạo = số dòng nhật ký `device.flush_grant_issued`, có nhật ký `device.flushed_under_grant`; lần gửi dừng đúng như biến thể (rớt mạng / 401). Lệnh của máy cũ vẫn được đếm trong tổng lệnh của ngày.
8. **Món cân**: mỗi dòng cân trên máy chủ giữ **đúng số gam** đã cân (350 g không thành 35 g; 250 g gõ theo kg trên thực đơn cũ thành 2,5 × 100 g) và **đúng đơn vị đã tính giá** (dòng đã gửi pha chế trước lúc đổi vẫn là kg); bill / in lại của **cả hai máy** (máy giữ thực đơn cũ và máy có thực đơn mới, đọc bằng hàm in của máy quầy `weighedOnSlip`) in đúng số gam và đơn vị đó; số món báo cáo so tới từng gam. Thử phá: cho máy mất mạng gửi số cân **không kèm đơn vị** (như máy bản cũ) thì bài kiểm đỏ 4 chỗ (25 g thay vì 250 g).
9. Báo cáo ngày và chốt ngày khớp tổng các dòng (xem phần "Báo cáo" bên dưới nếu có).

## Các bước

### Cách chạy

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

## Khi có lỗi

Hỏng thì bài kiểm in **mọi** chỗ lệch kèm dòng `replay with: pnpm sim:day --seed N --days D [--full]`. Chạy lại đúng lệnh đó ra đúng ngày đó (hạt giống quyết định khách, món, sự cố, lỗi mạng); thứ không tất định là mã định danh đơn (mỗi lần mỗi khác) và thời gian thực của máy chủ.

Hai lỗi gặp khi dựng nằm ở "Việc phát sinh" của bảng task, kèm seed.

## Chưa làm / sắp có

- Chưa có Chrome chạy giao diện máy quầy thật (tầng sau của quán giả lập).
- Máy thu ngân (`counter-2`, `handheld`) xin quản lý duyệt qua đúng route của máy quầy cho giảm giá cả đơn, hoàn tiền, hủy món đã gửi bar, hủy đơn đã gửi bếp; mất mạng thì chờ có mạng rồi làm lại. Lỗi bấm thanh toán hai lần: lệnh trả tiền thứ hai bị máy chủ từ chối, thu ngân bỏ qua ở "Cần xử lý" bằng duyệt của quản lý (cả hai kiểm cuối ngày, số lần ghi trong dòng tóm tắt `approvals`, `dismissed`). **Chưa có** duyệt cho giá nhập tay và thu chi két / đóng ca có chênh.
- Món cân chỉ có ở sự cố đổi đơn vị (hai bàn), chưa có trong khách ngẫu nhiên. Không có combo, món giá nhập tay, phí phục vụ, thuế khác 8% (Backlog; menu quán giả lập đã có sẵn một combo, chỉ chưa có bán).
