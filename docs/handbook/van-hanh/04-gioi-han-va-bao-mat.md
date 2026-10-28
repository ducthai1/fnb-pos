---
title: Giới hạn thử, kiểm Origin và dọn dẹp định kỳ
audience: van-hanh
screens: []
decisions:
  - D-026
  - D-037
  - D-055
  - D-065
  - D-066
tests:
  - apps/api/src/security/rate-limiter.test.ts
  - apps/api/src/security/attempt-lockout.test.ts
  - apps/api/src/http/allowed-origins-hook.test.ts
  - apps/api/src/http/client-address.test.ts
  - apps/api/test/integration/auth/sign-in-pairing-and-till-routes-are-rate-limited.test.ts
  - apps/api/test/integration/auth/rate-limits-count-the-client-behind-the-proxy.test.ts
  - apps/api/test/integration/server/api-entrypoint-limits-sign-in-attempts.test.ts
  - apps/api/test/integration/server/api-entrypoint-runs-the-cleanup-job.test.ts
  - apps/api/test/integration/ops/expired-pairing-codes-and-sessions-are-purged.test.ts
---

# Giới hạn thử, kiểm Origin và dọn dẹp định kỳ

## Dùng để làm gì

Ba lớp bảo vệ chạy sẵn trong máy chủ API, người vận hành cần biết để đặt đúng cấu hình và hiểu câu báo lỗi:

1. **Giới hạn tần suất** — chặn dò mật khẩu, dò PIN, dò mã ghép máy.
2. **Kiểm Origin** — chặn trang web lạ gửi lệnh ghi bằng phiên đăng nhập của người quản lý.
3. **Dọn dẹp định kỳ** — xóa mã ghép hết hạn và phiên đăng nhập cũ.

Ngoài ra là các khóa theo tài khoản/PIN mô tả ở [Đăng nhập](../quan-ly/01-dang-nhap-va-chi-nhanh.md) và [Nhân viên](../quan-ly/06-nhan-vien-vai-tro-quyen.md).

## Ai dùng, cần quyền gì

Người vận hành đặt biến môi trường trong `/etc/fnb/fnb-api.env` (xem `infra/fnb-api.env.example`).

## Các bước

1. Đặt `FNB_ALLOWED_ORIGINS` = đúng địa chỉ của cửa hàng (ví dụ `https://quan.example.vn`). `pnpm ops:preflight` đòi địa chỉ `https`.
2. API đứng sau Caddy ⇒ đặt `FNB_TRUSTED_PROXIES` (địa chỉ của Caddy, thường `127.0.0.1`) để giới hạn tần suất đếm theo **địa chỉ khách thật** chứ không theo Caddy.
3. Để nguyên giá trị mặc định của giới hạn và dọn dẹp trừ khi có lý do (bảng dưới).
4. `pnpm ops:preflight` kiểm hộ: origin chỉ https, đã tin proxy, job dọn dẹp bật.

## Luật và giới hạn

### Giới hạn tần suất (cửa sổ cố định 60 giây)

| Đường | Theo địa chỉ mạng | Theo đối tượng | Biến môi trường |
|---|---|---|---|
| Đăng nhập trang quản lý | 30 / phút | 10 / phút mỗi tài khoản | `FNB_RATE_LIMIT_LOGIN_PER_ADDRESS`, `…_LOGIN_PER_ACCOUNT` |
| Ghép máy quầy | 10 / phút | — | `FNB_RATE_LIMIT_PAIRING_PER_ADDRESS` |
| Đăng nhập PIN + duyệt tại máy | 300 / phút | 60 / phút mỗi máy | `FNB_RATE_LIMIT_TILL_PER_ADDRESS`, `…_TILL_PER_DEVICE` |

- Vượt giới hạn ⇒ máy chủ trả **429** mã `API_RATE_LIMITED` kèm `Retry-After` (số giây chờ). Cửa sổ đổi bằng `FNB_RATE_LIMIT_WINDOW_SECONDS`.
- **Webhook ngân hàng/cổng thanh toán không bao giờ bị giới hạn** (tiền về không được rơi).
- IPv6 đếm theo khối /64. Chỉ tin `X-Forwarded-For` từ các proxy trong `FNB_TRUSTED_PROXIES`.
- Bộ đếm nằm trong bộ nhớ của tiến trình API: khởi động lại là đếm lại; nhiều tiến trình thì mỗi tiến trình đếm riêng.
- Giới hạn chỉ gắn khi chạy như server (`start-server`); `pnpm dev:stack` và test không bị giới hạn.
- Ngoài giới hạn tần suất còn **khóa theo tài khoản** (sai mật khẩu 5 lần ⇒ khóa 15 phút) và **khóa PIN** (sai 5 lần ⇒ 5 phút, gấp đôi mỗi lần khóa liên tiếp, tối đa 24 giờ).

### Kiểm Origin

- Mọi **lệnh ghi** từ trình duyệt mang header `Origin` không nằm trong `FNB_ALLOWED_ORIGINS` bị từ chối **403** `API_ORIGIN_NOT_ALLOWED` ("Máy chủ không nhận yêu cầu từ địa chỉ trang này…").
- Yêu cầu **không** có `Origin` (webhook của ngân hàng, vỏ app máy quầy, script) không phải từ trang web nên được để cho cơ chế xác thực riêng của chúng.
- Đây là lớp khóa thứ hai sau cookie phiên `SameSite=Lax`.

### Dọn dẹp định kỳ

| Việc | Mặc định | Biến |
|---|---|---|
| Bật/tắt job | bật | `FNB_CLEANUP_ENABLED` |
| Chu kỳ | mỗi 60 phút (và một lượt ngay khi API khởi động) | `FNB_CLEANUP_INTERVAL_MINUTES` |
| Mã ghép máy | xóa khi đã hết hạn | — |
| Phiên đăng nhập hết hạn | giữ thêm 30 ngày rồi xóa | `FNB_SESSION_RETENTION_DAYS` |

- Job xóa theo từng cửa hàng bằng role của ứng dụng (RLS vẫn áp), không đụng các bảng chỉ-thêm (nhật ký, chứng từ).
- Nhiều tiến trình API cùng một database ⇒ chỉ bật job ở một tiến trình.

## Khi có lỗi

| Thấy gì | Nghĩa là | Làm gì |
|---|---|---|
| Trang quản lý: "Có quá nhiều lần thử trong một lúc nên máy chủ tạm từ chối. Đợi một phút rồi thử lại." | Vượt giới hạn tần suất | Chờ khoảng một phút rồi thử lại; lặp lại nhiều thì kiểm `FNB_TRUSTED_PROXIES` (thiếu nó thì mọi người dùng chung một địa chỉ của Caddy) |
| Trang quản lý: "Máy chủ không nhận yêu cầu từ địa chỉ trang này…" | Origin không khớp | Sửa `FNB_ALLOWED_ORIGINS` cho đúng địa chỉ trên thanh địa chỉ của trình duyệt (gồm `https://`), khởi động lại API |
| preflight cảnh báo job dọn dẹp tắt | `FNB_CLEANUP_ENABLED=false` | Bật lại nếu chỉ có một tiến trình |

## Chưa làm / sắp có

- Chưa có kho đếm dùng chung (Redis…) cho nhiều tiến trình API.
- Chưa có Content-Security-Policy; chưa có cảnh báo khi có người dò mật khẩu/PIN (mới chỉ ghi nhật ký).
- Con số giới hạn đang chờ chủ dự án xác nhận theo thói quen quán.
