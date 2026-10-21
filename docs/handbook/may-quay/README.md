# Sổ tay — Máy quầy

Hướng dẫn dùng máy bán hàng (POS) tại quầy, viết cho chủ quán, quản lý và thu ngân. Mọi câu báo lỗi trong sổ tay chép đúng như màn hình hiện. Ảnh chụp từ quán mẫu "Cà phê Mẫu".

| # | Mục | Đọc khi |
|---|---|---|
| 1 | [Ghép máy và đăng nhập](01-ghep-may-va-dang-nhap.md) | cài máy mới, đầu ca, đổi người |
| 2 | [Mở ca](02-mo-ca.md) | đầu ca |
| 3 | [Bán tại quầy](03-ban-tai-quay.md) | chọn món, tùy chọn, ghi chú, tìm món, phím tắt |
| 4 | [Thanh toán](04-thanh-toan.md) | tiền mặt, QR tự xác nhận, hóa đơn điện tử, in lại |
| 5 | [Bán theo bàn](05-ban.md) | sơ đồ bàn, gửi bếp nhiều lượt, tạm tính, chuyển bàn |
| 6 | [Hủy, giảm, hoàn và duyệt](06-huy-giam-hoan-va-duyet.md) | quyền, ngưỡng, quản lý nhập PIN duyệt tại chỗ |
| 7 | [Thu/chi két và đóng ca](07-thu-chi-va-dong-ca.md) | cuối ca |
| 8 | [Lịch sử đơn](08-lich-su-don.md) | tìm đơn, mở lại, hoàn tiền, in lại |
| 9 | [Mất mạng và đồng bộ](09-mat-mang-va-dong-bo.md) | mất mạng, "Cần xử lý", máy chủ khôi phục |
| 10 | [Phiếu in](10-phieu-in.md) | bill, phiếu bếp, tem ly, phiếu hủy, phiếu chốt ca |

Chỗ tài liệu cũ nói khác code: [../discrepancies.md](../discrepancies.md), mục "Máy quầy".

## Chụp lại ảnh

```
pnpm docs:shots:may-quay
```

Lệnh dựng các màn của máy quầy với dữ liệu quán mẫu (thực đơn và ảnh món của `scripts/src/dev-stack/seed`), mở bằng Chrome của máy (không cần API, không cần cơ sở dữ liệu) và lưu WebP ≤ 150 KB vào `docs/handbook/images/may-quay/`. Danh sách ảnh: `apps/pos/test/docs-shots/handbook-shot-list.ts`. Đường dẫn Chrome đổi bằng biến `FNB_CHROME_PATH` (mặc định `/usr/bin/google-chrome`).

## Mỗi mục có gì

Đầu mỗi file là khối YAML: `title`, `audience` (chu-quan · quan-ly · thu-ngan · pha-che · van-hanh), `screens` (tên màn trong `apps/pos/test/browser/pages/screen-names.ts`), `decisions` (D-xxx trong `docs/decision-log.md`), `tests` (file test chứng minh hành vi). Test `scripts/src/handbook/handbook-coverage.test.ts` giữ cho các khối này đúng (danh sách màn cố ý không mô tả: [`../_khong-mo-ta.md`](../_khong-mo-ta.md)).
