# Chạy quán thí điểm trên MỘT server (Ubuntu, không Docker)

> Đối tượng: người dựng server cho quán thí điểm. Làm theo thứ tự. Mọi lệnh `sudo` chạy trên server; thay `quan.example.vn` bằng tên miền thật.
> File mẫu trong thư mục này: [`fnb-api.env.example`](fnb-api.env.example), [`systemd/`](systemd), [`caddy/Caddyfile`](caddy/Caddyfile), [`cron/fnb-backup`](cron/fnb-backup). Diễn tập khôi phục: [`restore-drill.md`](restore-drill.md).

## 1. Trên server có gì

```
Internet ──443──► Caddy (TLS tự động, header bảo mật)
                   ├── /api/*  ──► fnb-api        127.0.0.1:3000  (node + tsx, user fnb)
                   ├── /pos/*  ──► file tĩnh      /srv/fnb/current/apps/pos/dist
                   └── còn lại ──► fnb-backoffice 127.0.0.1:3001  (next start, user fnb)
fnb-api ──► Postgres 17 (127.0.0.1:5432, role fnb_app, RLS)
fnb-api ──► ảnh món trên đĩa: /var/lib/fnb/media (FNB_MEDIA_DIR), phục vụ ở /api/media/...
cron 03:30 (user fnbbackup) ──► pg_dump bằng role fnb_backup ──► /var/backups/fnb (+ chép ra ngoài)
cron 03:40 (user fnbbackup) ──► rsync ảnh món ──► /var/backups/fnb/media
```

Một origin `https://quan.example.vn` cho cả POS (`/pos/`) và backoffice (`/`): không cần CORS, cookie phiên `__Host-` của API dùng được, `FNB_ALLOWED_ORIGINS` chỉ một giá trị.

Máy tối thiểu: 2 vCPU, 4 GB RAM (build Next cần ~1,5 GB), 40 GB SSD. Mở cổng 22, 80, 443; Postgres KHÔNG mở ra ngoài.

### Vì sao chọn như vậy

- **Backoffice bằng `next start`, không `standalone`**: standalone phải bật `output: "standalone"` trong `next.config.ts` rồi tự chép `static/` và `public/`; trên một server đã có sẵn repo + `pnpm install` thì `next start` đọc thẳng bản build trong `apps/backoffice/dist` (distDir của config), ít bước, ít chỗ sai. Đổi sang standalone khi tách máy build và máy chạy.
- **API chạy thẳng TypeScript bằng tsx** (quyết định đã có ở D-055): không có bước build cho API, `node --import tsx` là một tiến trình nên SIGTERM tới thẳng server.
- **POS ở `/pos/`**: backoffice (Next, chưa có basePath) đã chiếm `/`. POS là bản build tĩnh `vite build --base=/pos/` (lệnh `pnpm build:server`), tự gọi `/api` cùng origin.

## 2. Chuẩn bị máy

```bash
sudo timedatectl set-timezone Asia/Ho_Chi_Minh
sudo apt update && sudo apt -y upgrade
sudo apt install -y git curl ufw
sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw enable

# Người chạy API/backoffice, và người chạy backup (tách riêng: chỉ nó giữ mật khẩu đọc-hết).
sudo adduser --system --group --home /srv/fnb fnb
sudo adduser --system --group --home /var/lib/fnbbackup fnbbackup
sudo install -d -o fnb -g fnb /srv/fnb/releases
sudo install -d -o fnbbackup -g fnbbackup -m 700 /var/backups/fnb
sudo install -d -o root -g fnb -m 750 /etc/fnb
# Ảnh món (FNB_MEDIA_DIR): ngoài thư mục release, API ghi được, người backup đọc được.
sudo install -d -o fnb -g fnb -m 750 /var/lib/fnb /var/lib/fnb/media
sudo usermod -aG fnb fnbbackup
```

## 3. Node 22 và pnpm

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt install -y nodejs
sudo corepack enable            # pnpm đúng bản ghi trong package.json (10.34.7)
node --version                  # v22.x
```

## 4. Postgres 17 từ apt

Ubuntu 24.04 chỉ có 16, 26.04 có 18; hệ thống được test trên **17** ⇒ dùng kho PGDG.

```bash
sudo apt install -y postgresql-common
sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
sudo apt install -y postgresql-17 postgresql-client-17
sudo -u postgres psql -c "SHOW server_version;"     # 17.x
```

Mặc định chỉ nghe `localhost` và `pg_hba.conf` dùng `scram-sha-256` cho 127.0.0.1 — giữ nguyên. Đặt mật khẩu cho `postgres` (chỉ dùng để provision, không bao giờ cho API):

```bash
sudo -u postgres psql -c "\password postgres"
sudo install -o root -g root -m 600 /dev/null /etc/fnb/admin.env
sudo nano /etc/fnb/admin.env
#   FNB_ADMIN_DATABASE_URL=postgresql://postgres:<mật khẩu, mã hóa URL>@127.0.0.1:5432/postgres
#   FNB_OWNER_PASSWORD=<openssl rand -base64 24>
#   FNB_APP_PASSWORD=<openssl rand -base64 24>
```

## 5. Lấy code và build

Mỗi phiên bản một thư mục, `current` là symlink ⇒ quay lui = trỏ lại symlink.

```bash
V=v0.1.0                                   # tag sẽ chạy
sudo -u fnb git clone --branch $V --depth 1 <url repo> /srv/fnb/releases/$V
cd /srv/fnb/releases/$V
sudo -u fnb pnpm install --frozen-lockfile
sudo -u fnb pnpm build:server
sudo ln -sfn /srv/fnb/releases/$V /srv/fnb/current
```

`pnpm build:server` tạo đủ thứ để chạy (đã kiểm 2026-10-21, `pnpm build` thường cũng ra đúng hai thư mục này, chỉ khác POS ở base `/`):

| Sản phẩm                 | Đường dẫn                                                   | Ai dùng                                 |
| ------------------------ | ----------------------------------------------------------- | --------------------------------------- |
| POS (tĩnh, base `/pos/`) | `apps/pos/dist/` (`index.html` + `assets/`)                 | Caddy `file_server`                     |
| Backoffice (Next)        | `apps/backoffice/dist/`                                     | `fnb-backoffice.service` (`next start`) |
| API                      | không build: `apps/api/src/server/main.ts` + `node_modules` | `fnb-api.service`                       |
| Migration                | `packages/db/migrations/*.sql`                              | `pnpm db:provision`                     |

Đã chạy thử bố cục này trên máy dev (2026-10-21): Caddy 2.6.2 với đúng các khối `handle` của [`caddy/Caddyfile`](caddy/Caddyfile) (HTTP, cổng động), API bằng `node --import tsx src/server/main.ts` có `FNB_TRUSTED_PROXIES`, backoffice bằng `next start` trên bản build, POS từ `pnpm build:server`, quán mẫu của dev stack trên Postgres 17. Kết quả: `/api/health` 200; `/pos/` trả `index.html` với `Cache-Control: no-cache`; Chrome headless mở `/pos/`, ghép máy bằng mã, đăng nhập PIN, tới trạng thái "Đang kết nối" (đồng bộ thật qua `/api`); `/login` của backoffice hiện form; không lỗi console, không phản hồi 4xx/5xx. `caddy validate` nhận file Caddyfile mẫu. Chưa thử: TLS thật, máy Ubuntu sạch, systemd unit.

## 6. Database: role, database, migration

```bash
cd /srv/fnb/current
sudo bash -c 'set -a; . /etc/fnb/admin.env; set +a; pnpm db:provision'
```

Chạy lại lúc nào cũng được (lần sau không đổi gì, chỉ chạy migration mới). Nó in chuỗi `FNB_DATABASE_URL` cho API (mật khẩu ghi là `PASSWORD` = `FNB_APP_PASSWORD`).

Role cho backup (pg_dump phải thấy mọi tenant; xem lý do trong [`restore-drill.md`](restore-drill.md)):

```bash
P=$(openssl rand -base64 24 | tr -d '/+=')
sudo -u postgres psql -c "CREATE ROLE fnb_backup LOGIN BYPASSRLS PASSWORD '$P'" \
  -c "GRANT pg_read_all_data TO fnb_backup"
echo "127.0.0.1:5432:fnb:fnb_backup:$P" | sudo -u fnbbackup tee /var/lib/fnbbackup/.pgpass >/dev/null
sudo chmod 600 /var/lib/fnbbackup/.pgpass; unset P
```

## 7. Môi trường của API

```bash
sudo install -o root -g fnb -m 640 /srv/fnb/current/infra/fnb-api.env.example /etc/fnb/fnb-api.env
sudo nano /etc/fnb/fnb-api.env      # thay mọi <...>; chú thích từng biến nằm ngay trong file
```

Giữ một bản sao `FNB_PAYMENT_SECRET_KEY` ngoài server (két mật khẩu của chủ quán): mất nó là mọi secret cổng thanh toán đã lưu không mở được.

## 8. Dịch vụ

```bash
sudo cp /srv/fnb/current/infra/systemd/fnb-api.service /srv/fnb/current/infra/systemd/fnb-backoffice.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now fnb-api fnb-backoffice
journalctl -u fnb-api -n 20          # "fnb-api: listening on http://127.0.0.1:3000 (production, invoices: none)"
```

Cấu hình sai ⇒ API dừng ngay, log ghi tên biến sai (không ghi giá trị). Lỗi 500 được ghi vào journal kèm route và stack đã che bí mật.

## 9. Caddy

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
sudo cp /srv/fnb/current/infra/caddy/Caddyfile /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile       # tên miền + email nhận cảnh báo chứng chỉ
sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
curl -sI https://quan.example.vn/api/health    # 200, có Strict-Transport-Security
```

## 10. Backup tự động

```bash
sudo install -o root -g root -m 644 /srv/fnb/current/infra/cron/fnb-backup /etc/cron.d/fnb-backup
# chạy thử ngay một lần bằng đúng user của cron:
sudo -u fnbbackup sh -c 'cd /srv/fnb/current && FNB_PG_BIN_DIR=/usr/lib/postgresql/17/bin FNB_BACKUP_DATABASE_URL=postgresql://fnb_backup@127.0.0.1:5432/fnb FNB_BACKUP_DIRECTORY=/var/backups/fnb node --import tsx scripts/src/ops/backup-cli.ts'
journalctl -t fnb-backup -n 5
```

- Tên file `fnb-fnb-<giờ UTC>.dump`, giữ 14 bản mới nhất (`FNB_BACKUP_KEEP`), bản cũ hơn tự xóa.
- **Ảnh món không nằm trong dump**: dòng thứ hai của cron chép `/var/lib/fnb/media/` sang `/var/backups/fnb/media/` (rsync, chỉ ảnh mới). Chạy thử: `sudo -u fnbbackup rsync -a /var/lib/fnb/media/ /var/backups/fnb/media/`. Dòng `rclone` chép cả thư mục `/var/backups/fnb` nên ảnh cũng ra ngoài server.
- **Bắt buộc chép ra ngoài server** (bật dòng `rclone` trong file cron sau khi `rclone config`): ổ hỏng là mất cả DB lẫn backup.
- Diễn tập khôi phục mỗi tháng theo [`restore-drill.md`](restore-drill.md).

## 11. Kiểm trước khi mở: `pnpm ops:preflight`

```bash
cd /srv/fnb/current
sudo bash -c 'set -a; . /etc/fnb/fnb-api.env; . /etc/fnb/admin.env; set +a; pnpm -s ops:preflight'
```

In từng dòng ĐẠT / CẢNH BÁO / KHÔNG ĐẠT, exit 1 nếu có mục không đạt: cấu hình API hợp lệ (cùng luật API dùng lúc khởi động), `FNB_ENV=production`, `FNB_ALLOWED_ORIGINS` chỉ https, có `FNB_PAYMENT_SECRET_KEY` (thiếu = cảnh báo), API sau proxy đã tin proxy (`FNB_TRUSTED_PROXIES`), job dọn dẹp bật, role của API không SUPERUSER/BYPASSRLS, mọi migration đã chạy (và database không mới hơn code), `/health` trả 200.

## 12. Cập nhật phiên bản

**Không cập nhật trong giờ bán.** Lúc API khởi động lại (vài giây) máy quầy vẫn bán offline và tự đẩy lệnh sau, nhưng:

- POS mới chỉ tới máy quầy khi trang được tải lại. Tải lại giữa ca khi còn lệnh chưa đồng bộ, hoặc bản POS mới đổi dữ liệu cục bộ ⇒ có thể kẹt lệnh, lệch két. Việc "chặn cập nhật giữa ca / quay lui app quầy" chưa làm (T11-04).
- Migration chạy trước khi đổi code: code cũ đang chạy phải chịu được schema mới trong khoảng đó.

Các bước (sau khi quán chốt ngày, trước 04:00 hoặc giờ đóng cửa):

1. Backup tay: lệnh ở mục 10.
2. Lấy và build bản mới vào thư mục riêng (mục 5, KHÔNG đổi symlink).
3. Migration: `cd /srv/fnb/releases/$V && sudo bash -c 'set -a; . /etc/fnb/admin.env; set +a; pnpm db:provision'`.
4. Đổi bản chạy: `sudo ln -sfn /srv/fnb/releases/$V /srv/fnb/current && sudo systemctl restart fnb-api fnb-backoffice`.
5. `pnpm ops:preflight` (mục 11), đăng nhập backoffice, mở `/pos/` trên một máy quầy, bán thử một đơn tiền mặt rồi hoàn.
6. Giữ 2–3 bản cũ trong `/srv/fnb/releases`, xóa bản cũ hơn.

**Quay lui**: `sudo ln -sfn /srv/fnb/releases/<bản cũ> /srv/fnb/current && sudo systemctl restart fnb-api fnb-backoffice` — chỉ an toàn khi bản mới **không có migration**. Có migration thì code cũ có thể không chạy trên schema mới (preflight báo "database mới hơn code"); khi đó sửa tiến (bản vá) hoặc khôi phục backup của bước 1 (mất mọi thứ server nhận sau đó, và máy quầy phải xử lý tay — xem mục "Chưa xử lý" trong [`restore-drill.md`](restore-drill.md)) — quyết với chủ quán, đừng tự làm.

## 13. Checklist trước khi mở cho quán

- [ ] `pnpm ops:preflight` không còn KHÔNG ĐẠT; CẢNH BÁO nào còn lại đã được chủ quán biết.
- [ ] `https://quan.example.vn/api/health` 200 qua HTTPS; `http://` tự chuyển sang `https://`.
- [ ] Đăng nhập backoffice bằng tài khoản chủ quán; menu, giá, thuế, phí dịch vụ, sơ đồ bàn, nhân viên + PIN đã nhập và kiểm.
- [ ] Mỗi máy quầy: mở `https://quan.example.vn/pos/`, ghép bằng mã từ backoffice, đăng nhập PIN, in thử bill + phiếu bếp.
- [ ] Bán thử: tiền mặt, QR (báo có của ngân hàng về được — webhook `https://quan.example.vn/api/webhooks/payments/...` đã khai ở SePay/PayOS), hoàn tiền, mở/đóng ca, chốt ngày; số báo cáo khớp tay. Xóa dữ liệu thử hoặc ghi chú để không lẫn vào ngày đầu.
- [ ] Rút mạng một máy quầy, bán 2 đơn, cắm lại: đơn lên server, két khớp.
- [ ] Backup đêm qua có trong `/var/backups/fnb` VÀ ở nơi chép ra ngoài; đã diễn tập khôi phục ít nhất một lần ([`restore-drill.md`](restore-drill.md)).
- [ ] `/etc/fnb/fnb-api.env` và `admin.env` có bản giữ riêng ngoài server; không file nào trong repo chứa giá trị thật.
- [ ] Biết xem log: `journalctl -u fnb-api -f`, `journalctl -u fnb-backoffice`, `journalctl -t fnb-backup`, `/var/log/caddy/fnb-access.log`.
- [ ] Có người trực (số điện thoại) cho ngày đầu, biết cách khởi động lại: `sudo systemctl restart fnb-api`.

## 14. Giới hạn đã biết

- Ảnh món: thu nhỏ ở trình duyệt (≤ 800px, WebP), server chỉ kiểm loại bằng byte đầu file, ≤ 1 MB, mỗi cạnh 16–2048px; ảnh cũ (đã thay/xóa khỏi món) chưa được dọn khỏi đĩa (vài chục KB mỗi ảnh). Ảnh phục vụ không cần đăng nhập: ai có đường dẫn (chứa mã tenant + băm nội dung, không đoán được) đều xem được.

- Giới hạn tần suất đếm trong bộ nhớ của tiến trình API: khởi động lại là đếm lại; chạy nhiều tiến trình thì mỗi tiến trình cho đủ hạn mức (cần kho dùng chung khi mở rộng).
- Job dọn mã ghép/phiên chạy trong API: nhiều tiến trình cùng database thì chỉ bật ở một (`FNB_CLEANUP_ENABLED=false` ở các tiến trình khác).
- Chưa có giám sát lỗi tập trung (T11-01) và cảnh báo khi backup không chạy: kiểm `journalctl -t fnb-backup` mỗi sáng.
- Chưa có Content-Security-Policy (Next cần nonce cho script inline).
