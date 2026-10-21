---
title: Lịch sử đơn trong ngày — tìm, mở lại, hoàn tiền, in lại
audience:
  - thu-ngan
  - quan-ly
screens:
  - order-history
decisions:
  - D-028
  - D-031
  - D-057
tests:
  - apps/pos/src/features/history/order-history.test.ts
  - apps/pos/src/app/refund-from-history.test.tsx
  - apps/pos/src/app/staff-session-on-the-till.test.tsx
  - apps/pos/src/app/sale-invoice-reprint.test.tsx
  - e2e/pos/void-discount-refund-with-approval.spec.ts
---

# Lịch sử đơn

## Dùng để làm gì

Xem lại các đơn của **ngày kinh doanh hôm nay** trên máy: tìm đơn theo số, mở lại đơn chưa trả, hoàn tiền đơn đã trả, in lại hóa đơn.

## Ai dùng, cần quyền gì

Mọi nhân viên đã đăng nhập đều xem được. Hoàn tiền cần quyền `refund` hoặc quản lý duyệt (xem [06](06-huy-giam-hoan-va-duyet.md)). In lại và mở lại đơn chưa trả không cần quyền riêng.

## Các bước

1. Trên thanh thứ hai bấm **Lịch sử đơn**. Màn ghi **Ngày dd/mm** (ngày kinh doanh), đơn mới nhất ở trên.

   ![Lịch sử đơn](../images/may-quay/order-history.webp)

2. Lọc theo trạng thái: **Tất cả · Nháp · Đã trả · Đã hủy · Đã hoàn**. Gõ vào ô **Tìm theo số đơn** để tìm (khớp một phần số cũng ra).
3. Mỗi đơn ghi **Đơn số …**, nơi bán (**Mang đi** hoặc **Bàn T02**), số tiền, và **Máy khác** nếu đơn do máy khác của chi nhánh bán. Đơn đã hoàn một phần ghi thêm **Đã hoàn …**.
4. Việc làm được với từng đơn:
   - Đơn **Nháp** (chưa trả) tại quầy: **Mở lại đơn số …** — đơn quay về màn bán tại quầy để bán tiếp.
   - Đơn **Nháp** của bàn: **Mở ở sơ đồ bàn** — máy chuyển sang sơ đồ, chạm vào bàn để mở.
   - Đơn **Đã trả** (hoặc đã hoàn một phần): **Hoàn tiền đơn số …** (xem [06-huy-giam-hoan-va-duyet.md](06-huy-giam-hoan-va-duyet.md)) và **In lại hóa đơn số …** (bill hiện lại ở màn **In lại hóa đơn**).
5. Bấm **Về bán hàng** để quay lại.

## Luật và giới hạn

- Chỉ hiện đơn của **ngày kinh doanh hiện tại** (ngày bắt đầu lúc 04:00 theo mặc định của chi nhánh), gồm đơn máy này bán và đơn máy khác của chi nhánh mà máy đã nhận về khi đồng bộ.
- Đơn hoàn tiền **không** là một dòng riêng: nó nằm dưới đơn bán mà nó hoàn, và đơn bán được đánh dấu đã hoàn. Một lần hoàn đã bị hủy thì không tính.
- Mất trang (tải lại trang, đổi người) thì đơn quầy chưa trả **không mất**: mở lại từ lịch sử.
- In lại hóa đơn đã có hóa đơn điện tử: bill in lại kèm **mã tra cứu**; khi hóa đơn còn đang chờ phát hành thì chưa có nút in lại kèm mã tra cứu.

## Khi có lỗi

| Máy báo | Nghĩa là | Làm gì |
|---|---|---|
| Không có đơn nào khớp. | Không đơn nào khớp bộ lọc / số đang tìm | Đổi bộ lọc, xóa chữ tìm |
| Đơn này đã hoàn hết. | Không còn gì để hoàn | — |

## Mất mạng thì sao

Lịch sử đọc từ dữ liệu trên máy nên **vẫn xem được** khi mất mạng; chỉ thiếu những đơn máy khác bán trong lúc máy này mất mạng. Hoàn tiền mà cần quản lý duyệt thì cần mạng.

## Chưa làm / sắp có

- Xem đơn của ngày trước, tìm theo tên món / số tiền / tên khách.
- Mở lại đơn đã trả để sửa (`reopen_paid_order`).
- Báo cáo doanh thu trên máy quầy (báo cáo ở trang quản lý).
