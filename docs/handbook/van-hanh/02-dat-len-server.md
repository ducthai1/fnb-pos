---
title: Đặt hệ thống lên server cho quán
audience: van-hanh
screens: []
decisions:
  - D-055
  - D-067
  - D-123
tests:
  - apps/api/src/server/server-config.test.ts
  - apps/api/src/ops/preflight-checks.test.ts
  - apps/api/test/integration/server/preflight-passes-a-ready-deployment.test.ts
  - apps/api/test/integration/server/api-entrypoint-serves-and-stops.test.ts
  - apps/api/test/integration/server/api-entrypoint-logs-server-faults.test.ts
  - apps/api/test/integration/infra/provision-database-runs-twice.test.ts
  - apps/pos/src/features/updates/update-policy.test.ts
  - apps/pos/src/features/updates/release-watch.test.ts
---

# Đặt hệ thống lên server cho quán

## Dùng để làm gì

Tóm tắt cách chạy hệ thống cho quán thật trên **một** server Ubuntu. Hướng dẫn đầy đủ từng lệnh nằm ở [`infra/README.md`](../../../infra/README.md) — trang này cho biết **có gì, làm theo thứ tự nào, và những điều không được quên**.

## Ai dùng, cần quyền gì

Người vận hành có quyền `sudo` trên server, tên miền trỏ về server, và giữ được bí mật (mật khẩu cơ sở dữ liệu, khóa thanh toán) ở nơi an toàn ngoài server.

## Các bước

Trên server có:

```
Internet ──443──► Caddy (HTTPS tự động)
                   ├── /api/*  ──► API (Node, cổng nội bộ 3000)
                   ├── /pos/*  ──► máy quầy POS (file tĩnh)
                   └── còn lại ──► trang quản lý (Next, cổng nội bộ 3001)
API ──► Postgres 17 (chỉ nghe trong máy) · ảnh món trên đĩa /var/lib/fnb/media
cron 03:30 ──► backup cơ sở dữ liệu · cron 03:40 ──► chép ảnh món
```

Một địa chỉ duy nhất (ví dụ `https://quan.example.vn`) cho cả trang quản lý (`/`) và máy quầy (`/pos/`).

1. **Chuẩn bị máy**: Ubuntu, múi giờ `Asia/Ho_Chi_Minh`, tường lửa chỉ mở 22/80/443; tạo người chạy `fnb` và người chạy backup `fnbbackup`. Tối thiểu 2 vCPU, 4 GB RAM, 40 GB SSD.
2. **Node 22 + pnpm** (bản ghi trong `package.json`).
3. **Postgres 17** từ kho PGDG (hệ thống được kiểm trên 17), chỉ nghe `localhost`.
4. **Lấy mã và build** vào `/srv/fnb/releases/<phiên bản>`: `pnpm install --frozen-lockfile`, `pnpm build:server`, rồi trỏ symlink `/srv/fnb/current` vào đó.
5. **Cơ sở dữ liệu**: `pnpm db:provision` (tạo role, database, chạy migration — chạy lại lúc nào cũng được). Tạo role `fnb_backup` cho backup.
6. **Môi trường API**: chép `infra/fnb-api.env.example` thành `/etc/fnb/fnb-api.env`, điền mọi giá trị. **Giữ một bản `FNB_PAYMENT_SECRET_KEY` ngoài server**: mất nó là mọi bí mật cổng thanh toán đã lưu không mở được.
7. **Dịch vụ**: cài `fnb-api.service`, `fnb-backoffice.service` (systemd).
8. **Caddy**: chép `infra/caddy/Caddyfile`, sửa tên miền, `caddy validate`, reload.
9. **Backup tự động**: cài `infra/cron/fnb-backup`, chạy thử một lần, bật dòng chép ra ngoài server (xem [Sao lưu và khôi phục](03-sao-luu-va-khoi-phuc.md)).
10. **Kiểm trước khi mở**: `pnpm ops:preflight` — in từng dòng ĐẠT / CẢNH BÁO / KHÔNG ĐẠT.
11. Làm hết **checklist trước khi mở** ở mục 13 của `infra/README.md`: đăng nhập, nhập menu/giá/thuế/sơ đồ bàn/nhân viên, ghép từng máy quầy, in thử, bán thử tiền mặt + QR + hoàn + đóng ca + chốt ngày, rút mạng một máy bán 2 đơn rồi cắm lại.

### Cập nhật phiên bản

1. **Không cập nhật trong giờ bán** — làm sau khi chốt ngày.
2. Backup tay → build bản mới vào thư mục riêng → `pnpm db:provision` (migration) → đổi symlink `current` → khởi động lại hai dịch vụ → `pnpm ops:preflight` → bán thử một đơn.
3. Giữ 2–3 bản cũ để quay lui. Quay lui chỉ an toàn khi bản mới **không có migration**. Máy quầy tự nhận bản mới (hoặc bản quay lui) lúc yên, không cần đi từng máy.

## Luật và giới hạn

- API **không chạy** khi cấu hình sai hay thiếu: thiếu `FNB_ENV`, `FNB_ENV=production` mà dùng nhà cung cấp hóa đơn giả, cookie không Secure, thiếu `FNB_ALLOWED_ORIGINS`, hoặc role cơ sở dữ liệu của API là SUPERUSER/BYPASSRLS. Log chỉ ghi **tên** biến sai, không ghi giá trị.
- `pnpm ops:preflight` thoát mã 1 khi còn mục KHÔNG ĐẠT; kiểm: cấu hình hợp lệ, production, origin chỉ https, có khóa thanh toán, API đã tin proxy (`FNB_TRUSTED_PROXIES`), job dọn dẹp bật, role API không vượt RLS, migration đủ và database không mới hơn mã, `/health` trả 200.
- Lỗi 500 được ghi vào journal (phương thức, đường dẫn, mã, stack đã che bí mật) — không ghi nội dung yêu cầu.
- Máy quầy tự biết có bản POS mới (hỏi `version.json` mỗi 5 phút) và tự đổi vào lúc yên: không tải lại khi còn lệnh chưa đồng bộ hay đang thanh toán; có ca mở thì chờ thu ngân bấm hoặc đóng ca (xem [Cập nhật bản mới của máy quầy](../may-quay/12-cap-nhat-ban-moi.md)). `index.html` và `version.json` do Caddy gửi `no-cache`, file trong `assets/` có hash và `immutable`.
- **Máy chủ phải luôn nhận lệnh của bản POS ngay trước** (mở rộng rồi mới thu hẹp, "expand → contract"): một máy quầy chưa kịp cập nhật vẫn đẩy lệnh của bản cũ. Muốn bỏ một trường hay một loại lệnh: bản này thêm cái mới và vẫn nhận cái cũ, bản sau mới bỏ cái cũ sau khi mọi máy đã chạy bản này.
- Máy quầy so mã bản bằng **khác nhau**: quay lui một bản trên server thì máy quầy cũng đổi về bản đó.
- Xem log: `journalctl -u fnb-api -f`, `journalctl -u fnb-backoffice`, `journalctl -t fnb-backup`, `/var/log/caddy/fnb-access.log`.

## Khi có lỗi

| Thấy gì | Làm gì |
|---|---|
| `journalctl -u fnb-api` báo tên một biến môi trường sai rồi dừng | Sửa biến đó trong `/etc/fnb/fnb-api.env`, khởi động lại |
| preflight: "database mới hơn code" | Đang chạy mã cũ trên schema mới (quay lui sau migration): sửa tiến bằng bản vá hoặc khôi phục backup — quyết với chủ quán |
| Trang quản lý báo "Máy chủ không nhận yêu cầu từ địa chỉ trang này…" | `FNB_ALLOWED_ORIGINS` không khớp địa chỉ đang mở (xem [Giới hạn và bảo mật](04-gioi-han-va-bao-mat.md)) |
| Trang sửa món báo "Máy chủ chưa được cấu hình nơi lưu ảnh. Báo người quản trị." | Đặt `FNB_MEDIA_DIR` |
| Cài đặt báo "Máy chủ chưa được cấu hình để lưu bí mật cổng thanh toán. Báo hỗ trợ." | Đặt `FNB_PAYMENT_SECRET_KEY` |
| `/api/health` không trả 200 | Kiểm `systemctl status fnb-api`, kết nối Postgres |

## Chưa làm / sắp có

- Chưa thử trên máy Ubuntu sạch với TLS thật và systemd (đã thử bố cục Caddy + API + trang quản lý + POS trên máy phát triển).
- Chưa có giám sát lỗi tập trung và cảnh báo khi backup không chạy: kiểm `journalctl -t fnb-backup` mỗi sáng.
- Chưa có Content-Security-Policy.
- Chưa ép được bản POS tối thiểu (máy quầy cũ không bị buộc cập nhật); chưa có vỏ app cài trên máy.
- Chạy nhiều tiến trình API chưa được hỗ trợ trọn vẹn: giới hạn tần suất đếm riêng trong từng tiến trình (cần kho đếm chung), job dọn dẹp chỉ được bật ở một tiến trình (`FNB_CLEANUP_ENABLED=false` ở các tiến trình khác).
