---
title: Bản phát hành — đóng gói, cài và quay lui
audience: van-hanh
screens: []
decisions:
  - D-067
  - D-123
  - D-124
  - D-141
  - D-142
tests:
  - scripts/src/release/pack-release.test.ts
  - scripts/src/release/install-and-rollback-scripts.test.ts
  - apps/api/test/integration/sync/sync-refuses-a-till-below-the-minimum-build.test.ts
  - apps/api/src/server/server-config.test.ts
  - apps/pos/build-release.test.ts
---

# Bản phát hành — đóng gói, cài và quay lui

## Dùng để làm gì

Đưa một phiên bản mới lên server (và đưa về bản cũ khi cần) bằng đúng một lệnh, có kiểm checksum, backup, migration, kiểm sức khỏe và tự quay về khi bản mới không chạy. Chưa có server thật nên chưa có bước tự động đẩy lên server: người vận hành chạy lệnh cài bằng tay (mục "Chưa làm").

## Ai dùng, cần quyền gì

Người vận hành đăng nhập server bằng user `fnb` (chủ thư mục `/srv/fnb`), có `sudo` cho ba việc: khởi động lại `fnb-api` và `fnb-backoffice`, chạy migration bằng `/etc/fnb/admin.env`, chạy backup bằng user `fnbbackup` (mẫu sudoers ở `infra/README.md` mục 5). Làm tarball thì chỉ cần máy dev hoặc CI.

## Các bước

1. **Làm tarball** (máy dev hoặc lấy từ CI, mục Artifacts, giữ 14 ngày): `pnpm release:pack`. Ra `tmp/release-out/fnb-<mã bản>.tar.gz`, `.sha256` và `.manifest.json` (mã bản, mã git, giờ build, danh sách migration, sha256 từng file).
2. **Chép ba file lên server**, lấy script cài ra khỏi tarball và chạy (sau khi quán đóng cửa):
   `sudo -u fnb install-release.sh fnb-<mã bản>.tar.gz`
   Lần đầu trên server mới thêm `--no-start` (chưa có unit systemd và file môi trường để khởi động).
3. Script tự làm theo thứ tự: kiểm checksum → giải nén vào `releases/<mã bản>` → kiểm từng file → cài phụ thuộc `--prod` → **backup** → **migration** → đổi `current` → khởi động lại hai dịch vụ → hỏi `/health` → giữ 5 bản mới nhất.
4. Thoát mã 0 là xong: chạy `pnpm ops:preflight`, đăng nhập thử, bán thử một đơn.
5. **Ép máy quầy cũ cập nhật** (chỉ khi cần, xem mục "Bản tối thiểu" dưới đây).
6. **Quay lui**: `sudo -u fnb /srv/fnb/current/infra/release/rollback-release.sh [<mã bản>]` — về bản ngay trước hoặc bản chỉ định.

## Luật và giới hạn

- Thoát mã **1** nghĩa là việc cài không thành; script nói lý do ở dòng cuối và `current` vẫn là bản chạy được: checksum sai (không giải nén gì), cài phụ thuộc lỗi, backup lỗi, migration lỗi (bản cũ vẫn đang chạy), hoặc bản mới không trả lời `/health` sau 15 lần × 2 giây (script tự đổi về bản trước và khởi động lại).
- Backup chạy **trước** migration và migration chạy **trước** khi đổi bản; không có backup thì không cài.
- Bản mới đã chạy migration mà không khởi động được: migration vẫn nằm trong database, script nói tên. Bản trước vẫn chạy trên database mới hơn, nên bản phát hành sau phải tương thích ngược (mở rộng rồi mới thu hẹp).
- Bản mới không trả lời `/health` thì bị **gạt sang** `releases/.failed-<mã bản>-<giờ>` (giữ lại để xem, xóa tay khi xong): quay lui không ghi mã bản sẽ không bao giờ rơi vào bản vừa hỏng.
- Mỗi lúc chỉ **một** lần cài hoặc quay lui: script giữ khóa `/srv/fnb/.release.lock`, lần thứ hai dừng ngay, không đổi gì.
- Script **chép các file `assets/` của bản POS ngay trước** sang bản mới (tên file có mã băm nội dung nên không đè nhau; chỉ chép những file chính bản trước đó đã phát hành, không dồn từ các bản xa hơn). Lý do: máy quầy đang mở bản cũ tải các mảnh mã (chunk) khi dùng tới; nếu file đó bị xóa khỏi server thì máy hiện màn sự cố cho tới khi tải lại. Máy ở xa hơn một bản không được bảo vệ, nên phải được ép cập nhật (mục dưới).
- Giữ **5** bản mới nhất trong `/srv/fnb/releases`; không bao giờ xóa bản đang chạy hay bản ngay trước nó.
- **Quay lui bị từ chối** khi bản đang chạy đã thêm migration mà bản đích chưa có (hoặc một bên không có `migrations.txt`): in "REFUSED", tên các migration và ba cách xử lý (sửa tiến bằng bản vá; khôi phục backup chụp trước khi cài, vào database mới, mất đơn bán sau đó; hoặc `--after-migration-i-understand` khi chắc code cũ bỏ qua được migration). Mọi lần quay lui đều hỏi lại `/health`.
- **Bản tối thiểu (`FNB_MIN_POS_BUILD`).** Mỗi bản POS có một **số bản** (`build`): giờ của commit tính bằng giây (không phải mã git, vì mã git không so lớn nhỏ được); `FNB_RELEASE_BUILD` ghi đè khi đóng gói. Số này ghi trong `version.json` cạnh `index.html` của bản phát hành (`curl https://<tên miền>/version.json`) và máy quầy gửi nó ở header `x-fnb-pos-build` trong mọi lần đồng bộ. Khi file môi trường của API có `FNB_MIN_POS_BUILD=<số>`, máy chủ trả **426** cho máy quầy có số bản thấp hơn: máy hiện màn **Cần cập nhật máy bán hàng**, lệnh chưa gửi vẫn nằm trên máy (không rơi vào "Cần xử lý") và tự gửi sau khi cập nhật. Để trống thì nhận mọi bản (mặc định). Thứ tự làm: đưa bản POS mới lên → xác nhận máy quầy đã tải bản mới → mới đặt `FNB_MIN_POS_BUILD` bằng số bản của bản mới (hoặc của bản cũ nhất còn chấp nhận) → khởi động lại `fnb-api`. Gỡ giá trị đó là máy cũ được nhận lại.
- Máy quầy của bản **chưa gửi số bản** (bản trước khi có cơ chế này) **luôn được nhận**, kể cả khi đã đặt bản tối thiểu: máy đó không hiểu mã 426, và máy chủ vẫn nhận lệnh của bản POS ngay trước. Muốn chắc không còn máy như vậy thì xem lại danh sách thiết bị và cập nhật tay.
- Máy quầy đổi theo bản đang phát hành, kể cả bản quay lui, vào lúc yên (xem [Cập nhật bản mới của máy quầy](../may-quay/12-cap-nhat-ban-moi.md)).
- Mã bản = version của `apps/pos` + mã git ngắn; `FNB_RELEASE_ID` ghi đè. Cùng nội dung cho cùng byte (tarball dựng xác định).
- Script nhận thư mục gốc và tên lệnh từ biến môi trường (`FNB_BASE_DIR`, `FNB_SUDO`, `FNB_SYSTEMCTL`, `FNB_PNPM`, `FNB_CURL`, `FNB_HEALTH_URL`, `FNB_BACKUP_COMMAND`, `FNB_PROVISION_COMMAND`…) để chạy thử không cần root.

## Khi có lỗi

| Thấy gì | Làm gì |
|---|---|
| "the tarball does not match its checksum: not installing" | Chép lại file; so `sha256sum` với file `.sha256` |
| "missing …tar.gz.sha256" | Chép cả file `.sha256` cạnh tarball |
| "the backup failed; nothing changed. Fix it before updating" | Chạy backup tay (`infra/README.md` mục 10), sửa lỗi rồi cài lại |
| "the migrations failed; the previous release is still running" | Xem lỗi in ngay trên đó; sửa môi trường (`/etc/fnb/admin.env`) hoặc báo lập trình viên; bản cũ vẫn chạy |
| "switched back to <bản cũ>" | Bản mới không trả lời `/health`: xem `journalctl -u fnb-api -n 50` của bản mới rồi báo lập trình viên |
| "REFUSED: <bản> added migrations that <bản đích> does not have: …" | Làm theo ba cách in kèm; mặc định chọn sửa tiến |
| Máy quầy hiện "Cần cập nhật máy bán hàng" | Bản của máy thấp hơn `FNB_MIN_POS_BUILD` | Bấm **Cập nhật ngay** trên máy. Hiện lại sau khi cập nhật thì bản trên server chưa phải bản mới (xóa bộ nhớ đệm trình duyệt, hoặc hạ `FNB_MIN_POS_BUILD`) |
| "release … is the one running now" | Bản đó đang chạy rồi; muốn cài lại, cài một bản khác trước |
| "another install or rollback is running (…/.release.lock)" | Có người đang cài hoặc quay lui: chờ lần đó xong rồi chạy lại |

## Chưa làm / sắp có

- Chưa có bước CI tự đẩy bản lên server (staging tự động, production có người duyệt): cần server, khóa SSH và môi trường duyệt do chủ dự án cấp — xem `docs/release-r1-waiting-on-real-things-checklist.md`.
- Script chưa chạy thử trên Ubuntu thật với systemd, sudoers và `/health` thật; mới chạy trên thư mục tạm với lệnh giả.
- Chưa tự khôi phục database khi quay lui sau migration; việc đó làm tay theo `restore-drill.md`.
