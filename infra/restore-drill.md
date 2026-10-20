# Diễn tập khôi phục từ bản backup

> Mục tiêu: chứng minh **bản backup dùng được**, không chỉ "file có tồn tại". Làm tối thiểu mỗi tháng một lần và sau mỗi lần nâng Postgres / đổi migration lớn. Ghi kết quả vào bảng cuối trang.

## Backup gồm gì, không gồm gì

- `pnpm ops:backup` chạy `pg_dump --format=custom` một database (`fnb`): mọi bảng, dữ liệu, hàm, trigger, chính sách RLS, `GRANT` cho role app, `ALTER DEFAULT PRIVILEGES`, sổ migration (`fnb_migration`).
- **Không** gồm role (`fnb_owner`, `fnb_app`, `fnb_backup`) và mật khẩu của chúng: role thuộc cả cụm Postgres. Server mới phải chạy `pnpm db:provision` trước để có role.
- **Không** gồm file môi trường (`/etc/fnb/fnb-api.env`): `FNB_PAYMENT_SECRET_KEY` mất là mọi secret cổng thanh toán đã niêm phong trong DB không mở được nữa ⇒ giữ bản sao file env ở nơi khác (két sắt mật khẩu của chủ), không để cạnh file backup.
- Tên file: `fnb-<database>-<giờ UTC>.dump`, quyền `600`; ghi dưới tên `.partial` rồi mới đổi tên ⇒ file đúng tên luôn là bản hoàn chỉnh. Giữ `FNB_BACKUP_KEEP` bản mới nhất (mặc định 14), bản cũ hơn bị xóa; file khác trong thư mục không bao giờ bị đụng.

## Vì sao backup phải chạy bằng role vượt RLS

Mọi bảng tenant có `FORCE ROW LEVEL SECURITY` (ràng buộc cả owner). `pg_dump` chạy bằng `fnb_owner` hay `fnb_app` sẽ **dừng với lỗi** (hoặc, với `--enable-row-security`, ra bản backup RỖNG). Dùng role riêng chỉ đọc:

```sql
-- chạy bằng postgres (sudo -u postgres psql)
CREATE ROLE fnb_backup LOGIN BYPASSRLS PASSWORD '<sinh bằng: openssl rand -base64 24>';
GRANT pg_read_all_data TO fnb_backup;
```

Role này đọc được mọi thứ ⇒ mật khẩu chỉ nằm trong `PGPASSFILE` (quyền 600, chủ là user chạy cron). Không bao giờ dùng nó cho API.

## Các bước diễn tập (server tạm hoặc máy khác)

1. Chép bản backup mới nhất từ nơi lưu ngoài server (xem `README.md` mục cron) về máy diễn tập.
2. Máy diễn tập có Postgres 17 + `postgresql-client-17` (xem `README.md`). Tạo role bằng provisioning (database `fnb` rỗng đã migrate cũng được tạo, không sao):
   ```bash
   FNB_ADMIN_DATABASE_URL=postgresql://postgres@localhost/postgres?host=/var/run/postgresql \
   FNB_OWNER_PASSWORD=... FNB_APP_PASSWORD=... pnpm db:provision
   ```
3. Khôi phục vào database **mới** (không bao giờ ghi đè database đang có):
   ```bash
   FNB_RESTORE_ADMIN_URL=postgresql://postgres@localhost/postgres?host=/var/run/postgresql \
   pnpm ops:restore /var/backups/fnb/fnb-fnb-20261021T190000Z.dump --database fnb_drill
   ```
   - Tên đã tồn tại ⇒ lệnh từ chối, exit 1, không đụng gì. Chỉ khi chắc chắn mới thêm `--replace-existing` (xóa database đó rồi tạo lại).
   - `pg_restore` chạy trong một transaction: lỗi giữa chừng ⇒ database mới bị xóa, không có bản dở dang.
4. Kiểm (tối thiểu):
   - Số dòng mọi bảng bằng server gốc lúc backup (`SELECT count(*)` từng bảng, hoặc so với số trong báo cáo ngày).
   - RLS: `psql` bằng `fnb_app` vào `fnb_drill`, `SELECT count(*) FROM product;` phải ra **0** (chưa chọn tenant).
   - Chạy API trỏ `FNB_DATABASE_URL` vào `fnb_drill` (cổng khác), đăng nhập backoffice bằng tài khoản chủ quán, mở báo cáo ngày hôm qua: số khớp phiếu chốt ngày.
5. Xóa database diễn tập: `DROP DATABASE fnb_drill;`. Ghi kết quả vào bảng dưới.

## Khôi phục thật (server hỏng)

1. Dựng server mới theo `README.md` tới hết bước `pnpm db:provision`. API chưa bật (hoặc `sudo systemctl stop fnb-api fnb-backoffice`).
2. `FNB_RESTORE_ADMIN_URL=<FNB_ADMIN_DATABASE_URL trong /etc/fnb/admin.env> pnpm ops:restore <file> --database fnb --replace-existing` (database `fnb` lúc này là bản rỗng do provision tạo).
3. Chép lại `/etc/fnb/fnb-api.env` từ bản giữ riêng (đặc biệt `FNB_PAYMENT_SECRET_KEY`), `pnpm ops:preflight`, rồi mới bật API.
4. Mất dữ liệu = mọi thứ server nhận sau giờ của bản backup (cron mỗi đêm ⇒ tới 24 giờ).

**Chưa xử lý — máy quầy sau khi khôi phục (phải quyết trước khi mở bán thật):** database quay về quá khứ nhưng máy quầy thì không.

- Lệnh máy đã gửi và server đã nhận sau giờ backup: máy coi là xong, **không gửi lại** ⇒ mất khỏi server (đơn, tiền, ca).
- Số thứ tự lệnh của máy đi trước sổ lệnh của server ⇒ lệnh mới của máy có thể bị từ chối "sai thứ tự" mãi, máy kẹt đồng bộ.
- Con trỏ kéo thay đổi (`change_seq`) của máy lớn hơn số của server sau khi khôi phục ⇒ máy bỏ lỡ thay đổi menu/giá/bàn cho tới khi số của server vượt qua.

Cho tới khi có cơ chế (ví dụ "thế hệ server": khôi phục sinh mã mới, máy thấy mã đổi thì đẩy hết lệnh còn giữ rồi tải lại từ đầu), làm tay: ghi lại các đơn/phiếu ca in ra trong khoảng mất dữ liệu, xử lý lệnh còn chờ trên từng máy, rồi xóa dữ liệu cục bộ và ghép lại từng máy; nhập bù bằng tay những gì đã mất. (Cần đưa vào Backlog phát sinh.)

## Kết quả đo

| Ngày       | Ở đâu                                                                                                   | Dữ liệu                                                                                 | Backup                                     | Khôi phục                                       | Kết quả                                                                                                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-21 | Máy dev, test tự động `pnpm test:ops` (2 Postgres 17 nhúng, ổ NVMe, client `pg_dump`/`pg_restore` 18.6) | quán mẫu của dev stack (1 tổ chức, menu mẫu, sơ đồ bàn, 3 nhân viên), file dump 0,30 MB | pg_dump 75 ms; cả lệnh `ops:backup` 159 ms | pg_restore 154 ms; cả lệnh `ops:restore` 285 ms | 56 bảng bằng số dòng; RLS, policy, quyền bảng/hàm, default privileges, trigger giống hệt; `fnb_app` không thấy dòng nào khi chưa chọn tenant; chủ quán đăng nhập được; ghi đè bị từ chối khi thiếu cờ |

Ghi chú khi đo:

- Gói `embedded-postgres` chỉ có `initdb`/`pg_ctl`/`postgres`, **không có** `pg_dump`/`pg_restore`. Máy dev không có quyền root nên dùng bản 18.6 của Ubuntu tải bằng `apt-get download postgresql-client-18 libpq5` rồi giải nén (`dpkg-deb -x`), trỏ `FNB_PG_BIN_DIR` + `LD_LIBRARY_PATH`. pg_dump mới hơn server thì được; **cũ hơn server thì pg_dump từ chối** ⇒ server dùng `postgresql-client-17` (hoặc mới hơn).
- Số trên là dữ liệu rất nhỏ. Quán thí điểm sau vài tháng (vài chục nghìn đơn) dự kiến dump vài chục MB, vài giây; đo lại ở lần diễn tập đầu tiên trên server thật và ghi thêm dòng.
