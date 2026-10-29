# Trước khi phát hành R1 — việc đang chờ đồ thật

> Mỗi việc ở đây **cố ý dời** vì cần thứ chỉ chủ dự án có: server, máy quầy thật, máy in, tài khoản, sandbox, quán thí điểm, kế toán. Làm trước thì phải đoán cấu hình nên không kiểm được.
> **Luật:** dời một việc vì lý do này ⇒ thêm dòng ở đây **trong cùng commit** (ghi rõ đã có gì, còn thiếu gì, task / quyết định). Có đồ thật rồi thì đi từ trên xuống từng nhóm; làm xong dòng nào thì xóa dòng đó và ghi kết quả vào bảng task.
> Danh sách kiểm **lúc mở cho quán** (khi mọi thứ dưới đây đã xong) ở [`infra/README.md`](../infra/README.md) mục 13.

## 1. Server thật (staging + production)

| Việc | Đã có | Còn thiếu khi có server | Task / quyết định |
|---|---|---|---|
| Bước CI tự đẩy bản lên server: staging tự động sau mỗi lần gộp `main`, production bấm tay có người duyệt | `pnpm release:pack` (tarball + checksum + manifest), `infra/release/install-release.sh` và `rollback-release.sh`, bước CI đóng gói + tải lên artifact 14 ngày; script chạy thử trên thư mục tạm với `systemctl`/`pnpm`/`curl` giả (`scripts/src/release/install-and-rollback-scripts.test.ts`, trong `pnpm verify`) | Server, tên miền, khóa SSH dùng riêng cho deploy (secret GitHub, không bao giờ vào repo), GitHub Environment `production` có người duyệt; viết job deploy (tải artifact, chép lên, chạy `install-release.sh`) rồi chạy thử trên staging | T11-05, D-124 |
| Chạy thật `install-release.sh` / `rollback-release.sh` trên Ubuntu: user `fnb` + sudoers, systemd restart, `/health` thật, backup và migration thật, mất điện giữa chừng | Đã thử trên thư mục tạm với lệnh giả, và `pnpm install --frozen-lockfile --prod` + `next start` + nạp module API/scripts từ bản giải nén trên máy dev | Ba dòng sudoers mẫu trong `infra/README.md` mục 5 (dấu `;` có thể cần thoát), `/etc/fnb/backup.env`, cài bản đầu bằng `--no-start`, một lần cài bản mới và một lần quay lui thật; kiểm `mv -T` đổi `current` nguyên tử trên hệ tệp của server | T11-05, D-124 |
| Staging có dữ liệu giả (gồm bộ dữ liệu xấu) | Quán mẫu của `pnpm dev:stack` | Dựng trên server staging, nạp dữ liệu mẫu | T11-03 |
| Chạy thử runbook trên máy Ubuntu sạch: TLS thật, systemd unit, Caddy | Đã thử bố cục trên máy dev, HTTP, cổng động | Chạy đủ `infra/README.md` mục 2–11 trên server sạch | D-067 |
| Cảnh báo khi backup không chạy + chép backup ra ngoài server | `pnpm ops:backup` / `ops:restore`, cron, diễn tập khôi phục | URL ping (dịch vụ theo dõi cron) và đích rclone do chủ dự án chọn | T11-02, D-067 |
| Content-Security-Policy cho backoffice / POS | — | Next cần nonce cho script inline; thử trên domain thật | `infra/README.md` mục 14 |
| `FNB_PAYMENT_SECRET_KEY` bắt buộc ở production | Preflight đang chỉ cảnh báo | Chốt khi có tài khoản ngân hàng thật | Backlog 2026-10-21 |

## 2. Máy quầy thật (vỏ Windows / Android) + máy in

| Việc | Đã có | Còn thiếu | Task / quyết định |
|---|---|---|---|
| Vỏ Tauri (Windows), vỏ Capacitor (Android/iOS) | Bản web chạy đủ luồng bán, cửa `shell-bridge` | Máy Windows / Android, Rust, Android SDK | T04-12, T04-13 |
| In thật ESC/POS (bill, phiếu bếp, tem ly), CP1258 có dấu thanh | Mã hóa + xem trước giấy ở `packages/printing` | Máy in thật để thử khổ giấy, bảng mã, cắt giấy | T00-08, D-042 |
| Màn máy in + gán trạm → máy in ở trang quản lý | Máy quầy in theo cấu hình cố định `apps/pos/src/features/printing/printer-profiles.ts` | Bảng máy in, route, màn; cấu hình lấy từ máy thật | T04-14 |
| Hàng đợi in phía máy, in lại, báo lỗi | Server có `print.job_reported`, báo cáo lỗi in | Hàng đợi trên máy (cần vỏ native) | T04-15 |
| Món bàn khóa sau khi gửi bếp | Bản web không bao giờ "đã gửi" vì không có máy in nhận (Q16) | D-097 làm bản web ở đợt 6; kiểm lại với máy in thật | D-097 |
| Combo in lỗi ở một trạm thì lần sau in lại ở mọi trạm | Chấp nhận trùng phiếu hơn mất món | Ghi "đã gửi" theo từng trạm khi có máy in thật | D-114 |
| Cập nhật bản web: Caddy gửi `no-cache` cho `index.html` + `version.json` và `immutable` cho `assets/` ngoài đời thật; máy quầy thật đổi bản lúc yên | Bản web: máy quầy hỏi `version.json`, so khác (quay lui cũng tới), không đổi khi còn lệnh chưa gửi / đang thanh toán, thẻ "sau khi đóng ca" (D-123) | Kiểm bằng `curl -I` trên server thật, và một máy quầy thật qua một lần đổi bản + một lần quay lui; file `assets/` của bản cũ biến mất khi đổi bản (backlog) | T11-04, D-123 |
| Cập nhật nóng bản web bên trong vỏ native, token thiết bị trong keychain | Chưa có (bản web chạy trong trình duyệt) | Cơ chế tải bundle của Tauri / Capacitor; ép phiên bản tối thiểu (backlog T11-04) | T11-04, T04-05 |
| Cân điện tử | Ngăn nhập cân + nút "Đọc cân" (`weighing-scale.ts`) | Nối qua vỏ native | Backlog 2026-10-28 |

## 3. Tài khoản, sandbox, người thật

| Việc | Chờ ai / cái gì | Task / quyết định |
|---|---|---|
| Hóa đơn điện tử: adapter thật, idempotency của nhà cung cấp | Sandbox nhà cung cấp HĐĐT | T00-10, T05-06 |
| Hoàn tiền sau khi đã có hóa đơn | Kế toán | T00-05, T05-10 |
| QR ngân hàng chạy thật (webhook SePay / PayOS) | Tài khoản sandbox | T00-09 |
| Ví MoMo / VNPay / ZaloPay | Tài khoản doanh nghiệp | Backlog 2026-10-22 |
| Quán thí điểm: hồ sơ, phỏng vấn, chạy song song 3–5 ngày, go-live | Chủ dự án chọn quán | T00-01, T00-04, T05-13, T00-11 |
| Dùng thử KiotViet FnB / CukCuk để so | Tài khoản dùng thử | T00-02, T00-03 |
