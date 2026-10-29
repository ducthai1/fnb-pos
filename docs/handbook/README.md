# Sổ tay sử dụng fnb-pos

Sổ tay này hướng dẫn **dùng** hệ thống quản lý quán: thu ngân bán ở máy quầy, chủ quán và quản lý làm việc ở trang quản lý, người vận hành dựng và giữ server. Mỗi trang viết cho người làm việc đó, không cho lập trình viên.

Mọi điều trong sổ tay được viết theo **code, test và câu chữ thật trên màn hình** tại thời điểm viết. Ảnh chụp tự động từ quán mẫu "Cà phê Mẫu". Chỗ tài liệu cũ nói khác code được ghi ở [discrepancies.md](discrepancies.md). Tính năng có trong kế hoạch mà chưa có trong code chỉ nằm ở mục **"Chưa làm / sắp có"** của từng trang.

## Đọc theo vai trò

| Bạn là | Đọc trước | Rồi tới |
|---|---|---|
| **Chủ quán** | [Tổng quan](quan-ly/02-tong-quan.md) · [Nhân viên, vai trò và quyền](quan-ly/06-nhan-vien-vai-tro-quyen.md) · [Cài đặt](quan-ly/09-cai-dat.md) · [Doanh thu ngày](quan-ly/10-doanh-thu-ngay.md) | toàn bộ phần **Quản lý**; [Hủy, giảm, hoàn và duyệt](may-quay/06-huy-giam-hoan-va-duyet.md) để biết thu ngân cần duyệt khi nào |
| **Quản lý** (quản lý ca, cửa hàng trưởng) | [Đăng nhập và chi nhánh](quan-ly/01-dang-nhap-va-chi-nhanh.md) · [Thực đơn](quan-ly/03-thuc-don.md) · [Chốt ngày](quan-ly/11-chot-ngay.md) · [Khớp chuyển khoản](quan-ly/12-khop-chuyen-khoan-va-hoan-tien-qr.md) | [Thu chi và đóng ca](may-quay/07-thu-chi-va-dong-ca.md) · [Hủy, giảm, hoàn và duyệt](may-quay/06-huy-giam-hoan-va-duyet.md) |
| **Thu ngân** | toàn bộ phần **Máy quầy** theo thứ tự 01 → 10 | [Mất mạng và đồng bộ](may-quay/09-mat-mang-va-dong-bo.md) |
| **Pha chế** | [Phiếu in](may-quay/10-phieu-in.md) · [Ghép máy và đăng nhập](may-quay/01-ghep-may-va-dang-nhap.md) | [Bàn — phục vụ tại bàn](may-quay/05-ban.md) |
| **Vận hành** (người dựng server) | phần **Vận hành** theo thứ tự 01 → 04 | [Thiết bị](quan-ly/07-thiet-bi.md) |

## Mục lục

### Máy quầy (thu ngân, pha chế)

1. [Ghép máy và đăng nhập](may-quay/01-ghep-may-va-dang-nhap.md)
2. [Mở ca](may-quay/02-mo-ca.md)
3. [Bán tại quầy](may-quay/03-ban-tai-quay.md)
4. [Thanh toán](may-quay/04-thanh-toan.md)
5. [Bàn — phục vụ tại bàn](may-quay/05-ban.md)
6. [Hủy, giảm, hoàn và duyệt](may-quay/06-huy-giam-hoan-va-duyet.md)
7. [Thu chi và đóng ca](may-quay/07-thu-chi-va-dong-ca.md)
8. [Lịch sử đơn](may-quay/08-lich-su-don.md)
9. [Mất mạng và đồng bộ](may-quay/09-mat-mang-va-dong-bo.md)
10. [Phiếu in](may-quay/10-phieu-in.md)

### Quản lý (trang quản lý trên trình duyệt)

1. [Đăng nhập trang quản lý và chọn chi nhánh](quan-ly/01-dang-nhap-va-chi-nhanh.md)
2. [Tổng quan — số liệu hôm nay và việc cần làm](quan-ly/02-tong-quan.md)
3. [Thực đơn — món, size, nhóm tùy chọn, danh mục, hết món](quan-ly/03-thuc-don.md)
4. [Ảnh món](quan-ly/04-anh-mon.md)
5. [Nhập và xuất thực đơn bằng Excel](quan-ly/05-nhap-xuat-excel.md)
6. [Nhân viên, vai trò và quyền](quan-ly/06-nhan-vien-vai-tro-quyen.md)
7. [Thiết bị — ghép và thu hồi máy quầy](quan-ly/07-thiet-bi.md)
8. [Sơ đồ bàn — khu vực và bàn](quan-ly/08-so-do-ban.md)
9. [Cài đặt — công tắc, phí, tài khoản nhận tiền, hóa đơn điện tử](quan-ly/09-cai-dat.md)
10. [Doanh thu ngày](quan-ly/10-doanh-thu-ngay.md)
11. [Chốt ngày](quan-ly/11-chot-ngay.md)
12. [Khớp chuyển khoản và hoàn tiền QR cho khách](quan-ly/12-khop-chuyen-khoan-va-hoan-tien-qr.md)
13. [Phiếu in lỗi](quan-ly/13-phieu-in-loi.md)
14. [Bảng giá — giờ vàng, giá theo chi nhánh, giá theo ngày](quan-ly/14-bang-gia.md)

### Vận hành (người dựng và giữ server)

1. [Chạy thử cả hệ thống trên một máy](van-hanh/01-chay-thu-tren-may.md)
2. [Đặt hệ thống lên server cho quán](van-hanh/02-dat-len-server.md)
3. [Sao lưu và khôi phục](van-hanh/03-sao-luu-va-khoi-phuc.md)
4. [Giới hạn thử, kiểm Origin và dọn dẹp định kỳ](van-hanh/04-gioi-han-va-bao-mat.md)

### Khác

- [discrepancies.md](discrepancies.md) — chỗ tài liệu cũ và code nói khác nhau.

## Khuôn của mỗi trang

Đầu mỗi trang là một khối front-matter:

```yaml
---
title: Tên trang
audience: chu-quan | quan-ly | thu-ngan | pha-che | van-hanh
screens:            # màn máy quầy (tên trong apps/pos/test/browser/pages/screen-names.ts)
  - /settings       # hoặc trang quản lý (đường dẫn trong ADMIN_SECTIONS / app router)
decisions: [D-030]  # quyết định liên quan trong docs/decision-log.md
tests:              # file test chứng minh hành vi, đường dẫn từ gốc repo
  - apps/backoffice/src/components/settings/settings-switches.test.tsx
---
```

Rồi các phần: **Dùng để làm gì · Ai dùng, cần quyền gì · Các bước** (đánh số, có ảnh) **· Luật và giới hạn** (con số cụ thể) **· Khi có lỗi** (câu báo đúng như màn hình) **· Mất mạng thì sao · Chưa làm / sắp có**.

## Cách cập nhật sổ tay

1. **Đổi tính năng ⇒ sửa mục tương ứng của sổ tay trong cùng commit.** Đổi câu chữ trên màn hình (`src/messages`) thì sửa bảng "Khi có lỗi" của trang đó; đổi con số (ngưỡng, thời hạn, giới hạn) thì sửa "Luật và giới hạn".
2. **Thêm màn / trang mới** ⇒ thêm tên nó vào `screens` của đúng một trang sổ tay (hoặc vào `_khong-mo-ta.md` kèm lý do nếu cố ý không mô tả). Test `scripts/src/handbook/handbook-coverage.test.ts` (chạy trong `pnpm verify`) **đỏ** khi:
   - một trang của trang quản lý (menu `ADMIN_SECTIONS` và mọi `page.tsx`) không thuộc `screens` của trang sổ tay nào, hoặc thuộc hai trang;
   - một màn máy quầy trong `screen-names.ts` không thuộc trang nào (kiểm khi đã có thư mục `may-quay/`);
   - `screens` ghi tên màn không tồn tại; `tests` trỏ tới file không có; `decisions` ghi mã không có trong decision-log;
   - một ảnh `![…](…)` trỏ tới file ảnh không có;
   - front-matter thiếu trường hay sai `audience`.
3. **Chụp lại ảnh** sau khi đổi giao diện:

   ```
   pnpm docs:shots:backoffice   # ảnh phần Quản lý → docs/handbook/images/quan-ly/
   ```

   Lệnh tự dựng quán mẫu trên cổng trống (không đụng `pnpm dev:stack` đang chạy), dùng Chrome của máy, ép giao diện sáng, ghi WebP ≤ 150 KB. Ảnh phần Máy quầy có lệnh riêng của phần đó. Không chụp tay.
4. Code làm khác tài liệu cũ ⇒ ghi vào [discrepancies.md](discrepancies.md) (tài liệu nói gì, code làm gì, file:dòng); sửa xong thì xóa dòng đó.
