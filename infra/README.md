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

## 5. Bản phát hành: đóng gói ở máy build, cài bằng một lệnh

Mỗi phiên bản là một **tarball** làm sẵn (không build trên server). Mỗi bản ở một thư mục riêng `/srv/fnb/releases/<mã bản>`, `current` là symlink ⇒ đổi bản và quay lui = đổi symlink.

**Làm tarball** (máy dev hoặc CI; CI tự làm sau `pnpm build` và đính kèm file ở mục "Artifacts" của lần chạy, giữ 14 ngày):

```bash
pnpm install --frozen-lockfile
pnpm release:pack            # build POS (base /pos/) + backoffice, rồi đóng gói vào tmp/release-out/
```

Ra ba file: `fnb-<mã bản>.tar.gz`, `fnb-<mã bản>.tar.gz.sha256`, `fnb-<mã bản>.manifest.json` (mã bản, mã git, giờ build, danh sách migration, sha256 từng file). Mã bản = version của `apps/pos` + mã git ngắn (đặt `FNB_RELEASE_ID` để ghi đè), cũng là cái máy quầy so để biết có bản mới (`/pos/version.json`).

Trong tarball có đủ để chạy đúng như các mục dưới đây mô tả:

| Thứ | Đường dẫn trong bản | Ai dùng |
| --- | --- | --- |
| POS (tĩnh, base `/pos/`) + `version.json` | `apps/pos/dist/` | Caddy `file_server` |
| Backoffice (Next, đã build) | `apps/backoffice/dist/` + `next.config.mjs` | `fnb-backoffice.service` (`next start`) |
| API: mã nguồn TypeScript + gói dùng chung | `apps/api/src/`, `packages/*/src/` | `fnb-api.service` (`node --import tsx`) |
| Migration | `packages/db/migrations/*.sql`, danh sách ở `migrations.txt` | `pnpm db:provision` |
| Backup, provision, preflight | `scripts/src/`, `apps/api/src/ops/` | cron, `install-release.sh` |
| Script cài và quay lui | `infra/release/` | người vận hành |
| `RELEASE_ID`, `SHA256SUMS` | gốc bản | install kiểm checksum |

Bản **không** có: test, mã nguồn POS/backoffice, docs, bộ nhớ đệm build. `pnpm install --frozen-lockfile --prod` bỏ phụ thuộc phát triển; `tsx` là phụ thuộc chạy (API chạy thẳng TypeScript). Backoffice đọc `next.config.mjs` thay vì `next.config.ts` (đọc file TypeScript cần gói `typescript`, một phụ thuộc phát triển).

**Cài lần đầu**: làm mục 2–4, rồi cài bản đầu bằng `--no-start` (dưới đây): script giải nén, cài phụ thuộc, chạy migration (mục 6: tạo role và database) và đặt `current`, chưa khởi động gì vì unit systemd và file môi trường nằm trong chính bản này. Sau đó làm tiếp mục 6 (role backup), 7, 8, 9, 10. Một lần: cho user `fnb` khởi động lại hai dịch vụ và chạy hai việc cần quyền khác của script (`visudo -f /etc/sudoers.d/fnb-release`; ba dòng dưới là mẫu, **chưa thử trên server thật**, và sudoers đòi thoát dấu `;` thành `\;` trong tham số):

```
fnb ALL=(root) NOPASSWD: /usr/bin/systemctl restart fnb-api fnb-backoffice
fnb ALL=(root) NOPASSWD: /usr/bin/bash -c set -a; . /etc/fnb/admin.env; set +a; pnpm db:provision
fnb ALL=(fnbbackup) NOPASSWD: /usr/bin/bash -c set -a; . /etc/fnb/backup.env; set +a; pnpm -s ops:backup
```

Chép `infra/backup.env.example` thành `/etc/fnb/backup.env` (quyền 640, root:fnbbackup). Rồi chép ba file từ máy build lên server và:

```bash
# script cài nằm trong chính tarball: lấy ra chạy
mkdir /tmp/fnb-installer && tar -xzf fnb-<mã bản>.tar.gz -C /tmp/fnb-installer infra/release
sudo -u fnb /tmp/fnb-installer/infra/release/install-release.sh [--no-start] /đường/dẫn/fnb-<mã bản>.tar.gz
```

Script làm: kiểm checksum tarball và từng file → giải nén vào `releases/<mã bản>` → `pnpm install --frozen-lockfile --prod` → (không phải bản đầu) backup → migration (`pnpm db:provision`) → đổi `current` bằng một phép đổi tên → khởi động lại hai dịch vụ → hỏi `/health` (cùng thứ Caddy phục vụ ở `/api/health`); **không trả lời thì tự đổi về bản trước và thoát mã 1** → giữ 5 bản mới nhất (không bao giờ xóa bản đang chạy và bản ngay trước nó). Biến môi trường chỉnh được: xem đầu `infra/release/release-common.sh`.

## 6. Database: role, database, migration

```bash
cd /srv/fnb/current
sudo bash -c 'set -a; . /etc/fnb/admin.env; set +a; pnpm db:provision'
```

Chạy lại lúc nào cũng được (lần sau không đổi gì, chỉ chạy migration mới); bản cài đầu bằng `install-release.sh` đã chạy nó một lần, chạy lại để lấy chuỗi cho API. Nó in chuỗi `FNB_DATABASE_URL` cho API (mật khẩu ghi là `PASSWORD` = `FNB_APP_PASSWORD`).

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

- Máy quầy tự phát hiện bản POS mới (hỏi `/pos/version.json` mỗi 5 phút, khi có mạng lại, khi trang hiện lại) và tự đổi vào lúc yên: không bao giờ khi còn lệnh chưa đồng bộ hay đang thanh toán; chưa mở ca thì tự đổi khi máy nhàn rỗi 20 giây; đang mở ca thì hiện thẻ "Có bản cập nhật — sẽ cập nhật sau khi đóng ca" kèm nút "Cập nhật ngay". Bản **khác** bản đang chạy là có cập nhật, nên quay lui một bản trên server cũng tới máy quầy theo đường này.
- **Luật cho mọi bản phát hành: server phải nhận được lệnh của bản POS ngay trước đó** (mở rộng rồi mới thu hẹp, expand → contract): trong lúc máy quầy chưa kịp đổi bản, nó vẫn đẩy lệnh theo hợp đồng cũ. Đổi hợp đồng lệnh/đồng bộ thì làm hai bản liền nhau: bản 1 nhận cả cũ lẫn mới, bản 2 mới bỏ cái cũ.
- Một bản POS đổi dữ liệu cục bộ (cơ sở dữ liệu trên máy) phải tự chuyển dữ liệu cũ khi mở; không có bước chuyển tay trên máy quầy.
- Migration chạy trước khi đổi code: code cũ đang chạy phải chịu được schema mới trong khoảng đó.

Các bước (sau khi quán chốt ngày, trước 04:00 hoặc giờ đóng cửa):

1. Có `fnb-<mã bản>.tar.gz` + `.sha256` trên server (mục 5).
2. `sudo -u fnb /srv/fnb/current/infra/release/install-release.sh fnb-<mã bản>.tar.gz` — cả chuỗi ở mục 5, gồm backup và migration. Thoát mã 0 = bản mới đã trả lời `/health`; mã 1 = đã tự về bản trước (đọc dòng cuối để biết lý do; migration của bản mới nếu đã chạy thì vẫn còn trong database, script nói tên).
3. `pnpm ops:preflight` (mục 11), đăng nhập backoffice, mở `/pos/` trên một máy quầy, bán thử một đơn tiền mặt rồi hoàn.
4. Máy quầy tự đổi sang bản mới lúc yên (xem trên). Đổi hợp đồng lệnh/đồng bộ thì làm **hai bản liền nhau** (mở rộng rồi mới thu hẹp): bản mới luôn nhận được lệnh của bản POS ngay trước nó.

**Quay lui**: `sudo -u fnb /srv/fnb/current/infra/release/rollback-release.sh [<mã bản>]` — về bản ngay trước (hoặc bản chỉ định), khởi động lại dịch vụ, hỏi `/health`. Script **từ chối** khi bản đang chạy đã thêm migration mà bản đích chưa có (code cũ có thể không chạy trên schema mới) và in các cách xử lý:

1. Sửa tiến: phát hành bản vá trên bản đang chạy (cách nên dùng).
2. Khôi phục backup mà `install-release.sh` đã chụp ngay trước khi cài bản đó (`restore-drill.md`: khôi phục vào database MỚI, kiểm, rồi trỏ API sang) — mọi thứ bán sau backup đó mất, quyết cùng chủ quán.
3. Chỉ khi chắc các migration đó cộng thêm và code cũ bỏ qua được: chạy lại với `--after-migration-i-understand`.

Máy quầy cũng nhận bản quay lui theo đúng cách nhận bản mới (so khác, không so mới hơn).

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
- Lỗi của máy quầy và trang quản lý về cùng nhật ký với lỗi 500 của API (`journalctl -u fnb-api | grep "client error"`, xem sổ tay Vận hành 05); chưa có trang xem hay cảnh báo khi lỗi tăng. Chưa có cảnh báo khi backup không chạy: kiểm `journalctl -t fnb-backup` mỗi sáng.
- Chưa có Content-Security-Policy (Next cần nonce cho script inline).
