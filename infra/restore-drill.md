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
   - Thế hệ: `SELECT generation FROM fnb_server.generation;` (bằng `postgres`) ở `fnb_drill` khác server gốc và bằng mã `ops:restore` in ra. Đừng trỏ máy quầy thật vào database diễn tập: chúng sẽ gửi lại lệnh vào đó.
   - Chạy API trỏ `FNB_DATABASE_URL` vào `fnb_drill` (cổng khác), đăng nhập backoffice bằng tài khoản chủ quán, mở báo cáo ngày hôm qua: số khớp phiếu chốt ngày.
5. Xóa database diễn tập: `DROP DATABASE fnb_drill;`. Ghi kết quả vào bảng dưới.

## Khôi phục thật (server hỏng)

1. Dựng server mới theo `README.md` tới hết bước `pnpm db:provision`. API chưa bật (hoặc `sudo systemctl stop fnb-api fnb-backoffice`).
2. `FNB_RESTORE_ADMIN_URL=<FNB_ADMIN_DATABASE_URL trong /etc/fnb/admin.env> pnpm ops:restore <file> --database fnb --replace-existing` (database `fnb` lúc này là bản rỗng do provision tạo).
3. Chép lại `/etc/fnb/fnb-api.env` từ bản giữ riêng (đặc biệt `FNB_PAYMENT_SECRET_KEY`), `pnpm ops:preflight`, rồi mới bật API.
4. Mất dữ liệu ở server = mọi thứ server nhận sau giờ của bản backup (cron mỗi đêm ⇒ tới 24 giờ). Phần do máy quầy gửi thì máy tự gửi lại (mục dưới); phần làm ở backoffice thì không.
5. Khôi phục bằng cách khác `ops:restore` (snapshot ổ đĩa, bản sao được nâng lên…) ⇒ trước khi bật API chạy thêm `FNB_RESTORE_ADMIN_URL=... pnpm ops:new-server-generation --database fnb`. Database chưa mất gì thì chạy cũng vô hại: máy quầy không có gì để gửi lại, chỉ kéo lại dữ liệu từ đầu.
6. Sau khi bật API: mở lại (tải lại trang) POS trên từng máy khi tiện, để menu gốc của máy (bootstrap) lấy theo database vừa khôi phục.

## Máy quầy sau khi khôi phục

Database quay về giờ backup, máy quầy thì không. Cơ chế "thế hệ server" xử lý phần của máy quầy:

- Database có một mã thế hệ (`fnb_server.generation`, một hàng; app role chỉ đọc qua hàm `fnb_server.current_generation()`). Mã sinh khi migrate lần đầu; `pnpm ops:restore` **sinh mã mới** ngay sau `pg_restore` (in ra dòng `new server generation …`); `ops:new-server-generation` đổi bằng tay. Mọi câu trả lời `/sync/commands`, `/sync/changes`, `/sync/device-state` và `/pos/bootstrap` mang header `x-fnb-server-generation`.
- Máy giữ mã đã thấy và **nhật ký** các lệnh server đã trả lời (nhận hoặc từ chối) trong 7 ngày (`journalRetentionMs` của sync client), dọn mỗi giờ; lệnh chưa có câu trả lời không bao giờ bị dọn.
- Máy thấy mã khác ⇒ bỏ trang vừa kéo, hỏi `GET /sync/device-state` (lệnh cuối server còn giữ của máy này), đưa lại vào hàng đợi **đúng thứ tự `device_seq`** mọi lệnh trong nhật ký sau số đó (trước các lệnh mới), kéo lại thay đổi từ con trỏ 0 (bản sao cũ vẫn hiện tới khi có bản mới; bản nào server mới không còn thì bỏ sau khi kéo hết), giữ nguyên bản sao lạc quan của lệnh còn chờ, rồi lưu mã mới. Máy đang mất mạng lúc khôi phục thì làm việc này khi có mạng lại.
- POS hiện dòng "Máy chủ vừa được khôi phục — đang gửi lại N thao tác của máy này" tới khi gửi xong. Lệnh gửi lại bị từ chối (dữ liệu đã đổi, ví dụ giá đã sửa sau khôi phục nên tiền đã thu không khớp) vào danh sách **Cần xử lý** như mọi từ chối khác.
- Server ghi audit `sync.command_resent_after_restore` cho mỗi lệnh gửi lại (máy, lệnh, `device_seq`, mã thế hệ cũ, nhận/từ chối). Kiểm sau khôi phục: `SELECT payload->>'status', count(*) FROM audit_log WHERE action = 'sync.command_resent_after_restore' GROUP BY 1;` (trong tenant).

Còn phải làm tay:

- Backup cũ hơn nhật ký (mặc định 7 ngày) ⇒ máy thiếu lệnh để lấp khoảng trống, POS báo "… thao tác không còn trên máy để gửi lại. Báo quản lý" và lệnh mới của máy đó bị trả "sai thứ tự" mãi. Làm như cách cũ cho máy đó: ghi lại đơn/phiếu ca in ra trong khoảng mất, xử lý lệnh còn chờ, xóa dữ liệu cục bộ, ghép lại máy, nhập bù bằng tay.
- Việc làm ở backoffice sau giờ backup (menu, giá, nhân viên, sơ đồ bàn, máy ghép mới) mất và phải làm lại; phiên đăng nhập backoffice/nhân viên mở sau giờ backup hết hiệu lực (đăng nhập lại); máy ghép sau giờ backup phải ghép lại.
- QR thanh toán tạo sau giờ backup (đi qua API, không phải lệnh đồng bộ) mất ⇒ lệnh trả tiền gửi lại dính QR đó bị từ chối, vào Cần xử lý.
- Hóa đơn điện tử đã phát hành ở nhà cung cấp sau giờ backup: lệnh trả tiền gửi lại có thể xin phát hành lần nữa ⇒ đối chiếu với nhà cung cấp trước khi gửi lại (chưa có cơ chế chống trùng giữa hai thế hệ).
- Máy chạy POS cũ hơn cơ chế này, hoặc chưa từng đồng bộ với server có mã thế hệ, coi mã đầu tiên nó thấy là mã gốc ⇒ khôi phục trước khi mọi máy đã đồng bộ ít nhất một lần với bản mới thì không phát hiện được: làm tay như trên.
- Lệnh gửi lại được ghi tên người đang đăng nhập trên máy lúc gửi lại khi máy không còn giữ phiên của người đã tạo lệnh.

## Kết quả đo

| Ngày       | Ở đâu                                                                                                   | Dữ liệu                                                                                 | Backup                                     | Khôi phục                                       | Kết quả                                                                                                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-21 | Máy dev, test tự động `pnpm test:ops` (2 Postgres 17 nhúng, ổ NVMe, client `pg_dump`/`pg_restore` 18.6) | quán mẫu của dev stack (1 tổ chức, menu mẫu, sơ đồ bàn, 3 nhân viên), file dump 0,30 MB | pg_dump 75 ms; cả lệnh `ops:backup` 159 ms | pg_restore 154 ms; cả lệnh `ops:restore` 285 ms | 56 bảng bằng số dòng; RLS, policy, quyền bảng/hàm, default privileges, trigger giống hệt; `fnb_app` không thấy dòng nào khi chưa chọn tenant; chủ quán đăng nhập được; ghi đè bị từ chối khi thiếu cờ |

Ghi chú khi đo:

- Gói `embedded-postgres` chỉ có `initdb`/`pg_ctl`/`postgres`, **không có** `pg_dump`/`pg_restore`. Máy dev không có quyền root nên dùng bản 18.6 của Ubuntu tải bằng `apt-get download postgresql-client-18 libpq5` rồi giải nén (`dpkg-deb -x`), trỏ `FNB_PG_BIN_DIR` + `LD_LIBRARY_PATH`. pg_dump mới hơn server thì được; **cũ hơn server thì pg_dump từ chối** ⇒ server dùng `postgresql-client-17` (hoặc mới hơn).
- Số trên là dữ liệu rất nhỏ. Quán thí điểm sau vài tháng (vài chục nghìn đơn) dự kiến dump vài chục MB, vài giây; đo lại ở lần diễn tập đầu tiên trên server thật và ghi thêm dòng.
