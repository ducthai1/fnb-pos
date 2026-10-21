---
title: Sao lưu và khôi phục (cơ sở dữ liệu, ảnh món, thế hệ server)
audience: van-hanh
screens: []
decisions:
  - D-067
  - D-068
tests:
  - scripts/src/ops/backup-files.test.ts
  - scripts/src/ops/backup-environment.test.ts
  - scripts/test/ops/backup-restores-into-a-new-server.test.ts
  - apps/api/test/integration/sync/sync-answers-name-the-server-generation.test.ts
---

# Sao lưu và khôi phục (cơ sở dữ liệu, ảnh món, thế hệ server)

## Dùng để làm gì

Giữ bản sao dữ liệu của quán để server hỏng vẫn dựng lại được, và để khôi phục xong thì **máy quầy không mất đơn**. Chi tiết từng lệnh: [`infra/restore-drill.md`](../../../infra/restore-drill.md) và mục 10 của [`infra/README.md`](../../../infra/README.md).

## Ai dùng, cần quyền gì

Người vận hành server. Backup chạy bằng người `fnbbackup` (chỉ người này giữ mật khẩu đọc-hết); khôi phục cần mật khẩu quản trị Postgres (`FNB_RESTORE_ADMIN_URL`).

## Các bước

### Backup tự động (mỗi đêm)

1. Cron `03:30`: `pnpm ops:backup` — `pg_dump` dạng custom của database `fnb` bằng role `fnb_backup`, ghi `/var/backups/fnb/fnb-fnb-<giờ UTC>.dump`.
2. Cron `03:40`: chép **ảnh món** `/var/lib/fnb/media/` sang `/var/backups/fnb/media/` (rsync) — **ảnh không nằm trong dump**.
3. **Bắt buộc chép ra ngoài server** (bật dòng `rclone` trong file cron): ổ hỏng là mất cả dữ liệu lẫn backup.
4. Mỗi sáng xem `journalctl -t fnb-backup`.

### Diễn tập khôi phục (mỗi tháng, trên database khác)

```
pnpm ops:restore /var/backups/fnb/fnb-fnb-<giờ>.dump --database fnb_drill
```

Kiểm số đơn, số liệu một ngày đã chốt khớp bản gốc. Đừng trỏ máy quầy thật vào database diễn tập.

### Khôi phục thật (server hỏng)

1. Dựng server mới theo [Đặt lên server](02-dat-len-server.md) tới bước provision.
2. `pnpm ops:restore <file> --database fnb --replace-existing`.
3. Chép lại ảnh món vào `/var/lib/fnb/media/`.
4. Chép lại `/etc/fnb/fnb-api.env` từ bản giữ riêng (nhất là `FNB_PAYMENT_SECRET_KEY`), chạy `pnpm ops:preflight`, rồi mới bật API.
5. Khôi phục bằng cách khác `ops:restore` (snapshot ổ đĩa…) thì trước khi bật API chạy thêm `pnpm ops:new-server-generation --database fnb`.

## Luật và giới hạn

- Giữ **14 bản** mới nhất (`FNB_BACKUP_KEEP`), bản cũ hơn tự xóa. Mật khẩu không bao giờ nằm trên dòng lệnh (đọc từ `.pgpass`/biến môi trường).
- Backup phải chạy bằng role **vượt RLS** (`fnb_backup`): mọi bảng của cửa hàng có chính sách RLS ép buộc, kể cả chủ bảng cũng không đọc hết được.
- `ops:restore` chỉ ghi vào **database mới**; tên đã tồn tại thì từ chối, trừ khi thêm `--replace-existing` (xóa database đó rồi tạo lại). Công cụ Postgres phía khách phải ≥ 17.
- **Thế hệ server**: mỗi database có một mã thế hệ; `ops:restore` sinh mã mới ngay sau khi khôi phục. Mọi câu trả lời đồng bộ mang mã này. Máy quầy thấy mã khác thì **gửi lại** những lệnh server không còn (theo đúng thứ tự), kéo lại dữ liệu từ đầu; mỗi lệnh gửi lại được ghi nhật ký.
- Máy quầy giữ nhật ký lệnh đã được server trả lời **7 ngày**. Backup cũ hơn 7 ngày ⇒ máy thiếu lệnh để lấp khoảng trống, POS báo "… thao tác không còn trên máy để gửi lại. Báo quản lý" — phải xử lý tay cho máy đó (ghi lại đơn in ra trong khoảng mất, xóa dữ liệu máy, ghép lại, nhập bù).
- Khôi phục làm **mất mọi thứ server nhận sau giờ backup** mà không có máy quầy nào gửi lại được (ví dụ thay đổi menu, nhân viên, cài đặt làm trên trang quản lý) — làm lại tay.

## Khi có lỗi

| Thấy gì | Làm gì |
|---|---|
| `ops:restore` từ chối vì database đã tồn tại | Chọn tên khác, hoặc chắc chắn rồi thêm `--replace-existing` |
| `ops:restore: the environment is not valid` | Thiếu/sai `FNB_RESTORE_ADMIN_URL` hay đường dẫn công cụ Postgres |
| Máy quầy báo thao tác không còn trên máy để gửi lại | Backup cũ hơn nhật ký 7 ngày: xử lý tay như trên |
| Không thấy dòng mới trong `journalctl -t fnb-backup` | Cron không chạy: kiểm `/etc/cron.d/fnb-backup`, quyền thư mục `/var/backups/fnb` |

## Mất mạng thì sao

Trong lúc server hỏng/đang khôi phục, máy quầy **vẫn bán** (offline) và tự đẩy lệnh khi server có lại. Máy chạy bản POS cũ hơn cơ chế thế hệ, hoặc chưa đồng bộ lần nào với server có mã thế hệ, không tự phát hiện được việc khôi phục: làm tay.

## Chưa làm / sắp có

- Hóa đơn điện tử đã phát hành ở nhà cung cấp **sau giờ backup**: lệnh trả tiền gửi lại có thể xin phát hành lần nữa — chưa có cơ chế chống trùng giữa hai thế hệ; đối chiếu với nhà cung cấp trước.
- Chưa cảnh báo tự động khi backup không chạy, chưa kiểm tự động bản chép ra ngoài.
- Ảnh cũ không còn món nào dùng vẫn bị chép theo (chưa dọn).
