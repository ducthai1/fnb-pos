# Báo cáo tiến độ fnb-pos — 20/10/2026

> Phạm vi: từ lúc bắt đầu nghiên cứu (19/10 19:18) tới commit `a3ed16e` trên `main` (20/10 14:52).
> Mục đích: để chủ dự án duyệt **một lượt** trước khi chạy tiếp. Phần cần duyệt nằm ở §8 và §9.

---

## 1. Tóm tắt điều hành

- **Đã có một hệ thống chạy được ở mức lõi:** app bán hàng chạy trên trình duyệt (POS), backoffice web cho chủ quán, API + database, đồng bộ offline nhiều máy, thanh toán QR tự xác nhận, hóa đơn điện tử (nhà cung cấp giả), ca/két, chốt ngày, báo cáo ngày.
- **Mọi thứ được chứng minh bằng test tự động** — 2.083 unit · 1.531 tích hợp với Postgres thật · 16 kịch bản đồng bộ · 59 test trên Chrome (gồm 10 luồng E2E đi qua API thật). **Chưa ai dùng tay, chưa có máy in thật, chưa deploy.**
- **Hai vòng review sâu** tìm ra 33 lỗi (4 nặng, 12 trung bình); **đã sửa 30 — gồm cả 4 lỗi nặng; còn mở 3 lỗi trung bình, đều ở hóa đơn điện tử**, mỗi lỗi có test tái hiện đỏ trước khi sửa.
- **Chưa tới R1** (quán thí điểm dùng thật). Còn thiếu chính: màn bàn + hủy/giảm/hoàn/đóng ca trên POS, lệnh dựng môi trường để bấm thử, app cài trên máy quầy + in thật, nhà cung cấp hóa đơn thật, deploy.
- **Cần bạn:** chốt 12 quyết định + 8 câu hỏi vận hành (§8), duyệt kế hoạch đợt tiếp (§9), và một số việc chỉ bạn làm được (§9.3).

---

## 2. Số liệu

| Chỉ số | Giá trị |
|---|---|
| Thời gian | nghiên cứu 19/10 19:18 → 23:00 · code 20/10 00:23 → 14:52 |
| Commit trên `main` | 150 (đã push `github.com/ducthai1/fnb-pos`) |
| Dòng code (không tính test) | ~47.000 |
| Dòng test | ~40.900 (≈ 0,87 dòng test / 1 dòng code) |
| File test | ~360 |
| Migration DB | 21 file (0001 → 0023) |
| Tài liệu | 33 file, ~4.800 dòng trong `docs/` |
| Cổng kiểm tra | unit 2.083 · `test:api` 1.531 · `test:sync` 16 · `test:browser`/E2E 59 — **xanh** |
| Chi phí hạ tầng dev/test | **0 đ** (xem §7) |
| Token subagent | ~11,8 triệu (xem §7) |

Theo gói:

| Gói | Code | Test | Vai trò |
|---|---|---|---|
| `packages/domain` | 6.220 | 6.974 | luật nghiệp vụ thuần: tiền, giá, topping, tổng tiền, thuế, giảm giá, hủy, hoàn, quyền, ca, bếp, VietQR |
| `packages/contracts` | 2.292 | 1.814 | hình dạng dữ liệu trên mạng (zod), dùng chung server/POS/backoffice |
| `packages/db` | 4.221 | 234 | migration SQL, RLS, Postgres nhúng cho test |
| `packages/sync-client` | 2.211 | 2.710 | đồng bộ phía máy quầy (SQLite, hàng đợi lệnh) |
| `packages/printing` | 1.649 | 923 | ESC/POS, TSPL, tiếng Việt Windows-1258, mẫu in |
| `packages/feature-flags` | 284 | 350 | công tắc tính năng + cấu hình kế thừa |
| `apps/api` | 12.720 | 21.167 | server Fastify |
| `apps/pos` | 6.792 | 3.176 | app bán hàng (React + Vite) |
| `apps/backoffice` | 8.581 | 2.469 | web quản trị (Next.js 15.5) |
| `e2e` | 1.985 | 1.046 | 10 luồng E2E |

---

## 3. Tiến độ theo mốc R1

R1 = quán thí điểm (cafe có quầy + bàn) bỏ phần mềm cũ, dùng hệ thống này.

| Phase | Nội dung | Trạng thái |
|---|---|---|
| 00 | Chốt yêu cầu, spike kỹ thuật | 🟡 spike đồng bộ ✅; spike in thật, sandbox QR/HĐĐT, dùng thử KiotViet/CukCuk, kế toán — **chờ bạn** |
| 01 | Tenant, đăng nhập, thiết bị, PIN, quyền, cấu hình | ✅ |
| 02 | Lõi nghiệp vụ (giá, thuế, tổng, giảm, hủy, hoàn) | ✅ |
| 03 | Menu, cấu hình, mẫu loại quán | 🟡 menu ✅, cấu hình ✅; mẫu loại quán, nhập/xuất Excel, ảnh món chưa |
| 04 | Bán tại quầy, offline, in, ca/két, hủy/hoàn | 🟡 server ✅ hết; POS: bán + tiền mặt + QR + offline ✅; **UI hủy/giảm/hoàn/đóng ca chưa**; in thật chưa |
| 04b | Bàn cơ bản | 🟡 server ✅; **màn bàn trên POS chưa** |
| 05 | QR tự xác nhận, HĐĐT, chốt ngày, báo cáo | 🟡 ✅ với nhà cung cấp HĐĐT giả; adapter thật chờ sandbox; chạy song song ở quán chưa |
| 11 | Vận hành (giám sát, backup, deploy, cập nhật app) | 🔴 chưa bắt đầu |

**Ước lượng:** phần code còn lại tới R1 khoảng 4 đợt (~3,7–4,7 triệu token, §9); phần còn lại phụ thuộc việc bạn cung cấp (máy in, sandbox, kế toán, quán thí điểm).

---

## 4. Tính năng — đã kiểm tới mức nào

Bốn mức chứng minh, từ yếu tới mạnh:

- **M1** — luật thuần được test (unit/property, chạy hàng nghìn tổ hợp ngẫu nhiên).
- **M2** — chạy qua API thật + Postgres thật (test tích hợp, có RLS bật).
- **M3** — E2E: Chrome thật bấm qua giao diện, gọi API thật.
- **M4** — người thật dùng / máy thật (máy in, máy quầy, ngân hàng thật). **Chưa có tính năng nào đạt M4.**

| Nhóm | Tính năng | Mức |
|---|---|---|
| Tiền & tổng | tiền theo đồng (không số thực), giá theo biến thể/bảng giá/khung giờ, topping + giới hạn chọn, combo (lõi), thuế theo nhóm thuế suất, phí phục vụ, giảm dòng/giảm đơn, hủy món, hoàn từng phần đúng từng đồng | M1 + M2 |
| Đăng nhập & quyền | đăng nhập backoffice, chọn tổ chức/chi nhánh, ghép máy bằng mã, PIN nhân viên + khóa leo thang, vai trò + ngưỡng, duyệt tại chỗ bằng PIN quản lý, cách ly dữ liệu giữa các quán (RLS) | M2; ghép máy + PIN: M3 |
| Menu | trình sửa món (biến thể, nhóm tùy chọn, xem trước lựa chọn), danh mục, trạm, hết món, bảng giá | M2 + M3 (dựng menu trà sữa từ đầu) |
| Bán tại quầy | chọn món + tùy chọn, giỏ, lưu nháp, trả tiền mặt (tiền thừa), xem trước bill | M3 |
| Offline | bán khi rớt mạng, lưu SQLite trong trình duyệt, tự đẩy lên khi có mạng, không mất/không trùng đơn, 2 máy cùng sửa | M3 + 16 kịch bản đồng bộ |
| Thanh toán QR | VietQR động có mã nội dung, webhook SePay/PayOS ký bí mật, tự khớp tiền vào đơn, khớp tay ở backoffice, tiền thừa/khách trả 2 lần ⇒ `refundDue` | M3 (webhook giả lập đúng định dạng tài liệu; **chưa thử với ngân hàng thật**) |
| Ca & két | mở ca, thu/chi két, đóng ca có đếm tiền, chênh lệch cần duyệt, đơn offline về muộn vẫn vào đúng ca | M2 (**POS chưa có màn đóng ca**) |
| Bếp & in | phiếu bếp theo trạm (chỉ in phần mới/đổi), ESC/POS + TSPL, tiếng Việt, in lại, danh sách in lỗi | M1 + M2 (ảnh in so file mẫu; **chưa in trên máy thật**) |
| Bàn | khu vực + bàn, mở bàn, 2 máy mở cùng bàn, chuyển bàn, tạm tính | M2 (**POS chưa có màn bàn**; backoffice có danh sách sơ đồ) |
| Hóa đơn điện tử | hồ sơ theo chi nhánh, 1 hóa đơn mỗi lần trả, hàng đợi + thử lại, thông tin người mua (MST), gửi lô cuối ngày | M3 với **nhà cung cấp giả** |
| Chốt ngày & báo cáo | chốt ngày (chặn khi còn ca mở / bàn mở / hóa đơn chưa phát), báo cáo doanh thu ngày theo định nghĩa cố định | M3 |
| Cài đặt | công tắc tính năng theo thương hiệu/chi nhánh/máy, phí, phương thức thanh toán, bí mật webhook (mã hóa, không bao giờ trả lại) | M3 |

**Chưa có (cần cho R1):** màn bàn trên POS; hủy/giảm/hoàn có PIN duyệt trên POS; đóng ca trên POS; lịch sử đơn + mở lại nháp; combo/giá mở/món cân trên POS; hồ sơ máy in; app cài trên máy quầy (Tauri/Capacitor); nhà cung cấp HĐĐT thật; lệnh dựng môi trường để bấm thử; deploy.

---

## 5. Chất lượng

### 5.1 Review sâu

Hai vòng review do agent riêng làm, **chỉ đọc**, có viết test tái hiện ("probe") và đột biến code để tìm test giả.

| Vòng | Phạm vi | Phát hiện | Đã sửa | Còn mở |
|---|---|---|---|---|
| 1 (sau đợt 1–2) | DB, xác thực, tiền & tổng, quyền | 16 — 1 nặng · 4 trung bình · 11 nhẹ; 75 đột biến, 7 sống | 15 | 0 (B5 là câu hỏi nghiệp vụ ⇒ D-022) |
| 2 (sau đợt 3–7) | thanh toán, đồng bộ, HĐĐT, chốt ngày, client | 17 — 3 nặng · 8 trung bình · 6 nhẹ; 24 đột biến, 6 sống; 8/8 probe tái hiện được lỗi | 14 | **3: W9, T1, T2** |

Bốn lỗi nặng (đều đã sửa, mỗi lỗi có test đỏ trước khi sửa):

- **B1** — dòng hủy/hoàn không bị so với dòng gốc ⇒ máy quầy có thể "hoàn" món chưa từng bán. Sửa: server tự dựng dòng đảo từ ý định, không nhận dòng do máy gửi lên.
- **W1** — tiền mặt hoàn cho khách không trừ vào két của ca ⇒ ca nào có hoàn tiền cũng "thiếu" đúng số đó.
- **W2** — hủy món sau khi giảm toàn đơn làm tỉ lệ giảm vượt mức đã duyệt mà không ai duyệt lại.
- **W3** — QR khách đã chuyển tiền bị bỏ qua khi thu ngân trả bằng tiền mặt hoặc hủy đơn ⇒ khách trả 2 lần mà không ai thấy. Sửa: chặn, và tiền thừa vào danh sách `refundDue` ở backoffice.

Còn mở (lên lịch ở đợt 9d):

- **W9** — worker HĐĐT gọi nhà cung cấp không có timeout ngắn hơn thời gian giữ việc; câu trả lời "đã phát hành" về muộn có thể bị bỏ ⇒ rủi ro phát hành trùng khi dùng nhà cung cấp thật. Chưa gây hại vì đang dùng bản giả.
- **T1, T2** — thiếu test: worker khác nhận lại việc khi hết hạn giữ; chốt ngày khi còn hóa đơn đang thử lại.

### 5.2 Cách giữ chất lượng

- Luật nghiệp vụ nằm một chỗ (`packages/domain`), thuần (không mạng, không đồng hồ) — POS offline và server chạy **cùng một đoạn code**. ESLint chặn `Date.now`/`fetch`/`Math.random` trong gói này.
- Test tích hợp chạy trên Postgres 17 thật với RLS bật và role app không phải chủ bảng — rò dữ liệu giữa các quán là test đỏ.
- 29 luật viết test (`docs/testing-strategy-and-test-file-layout.md`), gồm: test phải đỏ khi gỡ hành vi; có dữ liệu xấu (tên dài, emoji, số lớn); có kịch bản chạy lần 2 trên dữ liệu cũ; đọc status code chứ không đọc chữ trên màn.
- Cổng chạy trước mỗi lần merge: typecheck · lint · unit · `test:api` · `test:sync` · `test:browser`. Chưa có CI tự chạy trên GitHub.

---

## 6. Kiến trúc thực tế và chỗ khác kế hoạch

| Hạng mục | Kế hoạch ban đầu | Thực tế | Vì sao |
|---|---|---|---|
| App máy quầy | vỏ native (Tauri cho Windows, Capacitor cho Android/iPad) | chạy trên **trình duyệt** (PWA), SQLite WASM; vỏ native để đợt 11 | máy chưa có Rust/Android SDK; logic giống hệt nhau, vỏ chỉ thêm in + lưu bền. Safari có thể xóa dữ liệu chưa đồng bộ ⇒ iPad bắt buộc dùng app (D-024) |
| Đồng bộ | máy gửi đơn đã tính | máy gửi **ý định** (thêm món, hủy dòng, hoàn…), server tính lại và trả ảnh chụp | sau lỗi B1: không tin con số do máy tính |
| Giờ giấc | tin giờ máy quầy | hạn QR, hạn duyệt do **giờ server** định (D-052); luật chung cho mọi `createdAt` chưa làm | máy lệch giờ lách được hạn |
| DB cho test | Docker | Postgres 17 **nhúng** | tài khoản máy này không có quyền Docker |
| Tài liệu | ở kho kiến thức chung | ngay trong `docs/` của repo (D-015) | bạn chốt |
| API | server chạy được | **chưa có điểm khởi động + lệnh dev**, chỉ chạy trong test | ưu tiên làm luật trước; là việc đầu tiên của đợt 9c |

### Rủi ro

| Rủi ro | Mức | Cách xử |
|---|---|---|
| **Chưa ai bấm thử bằng tay** — test xanh không chứng minh dễ dùng | cao | đợt 9c có `pnpm dev:stack` để bạn tự bấm; quán thí điểm dùng song song trước R1 |
| Máy in thật: tiếng Việt CP1258 có thể in dấu thành ô riêng, lệch cột | cao | chỉ kiểm được với máy thật (spike in) |
| Luật HĐĐT (NĐ 254/2026, TT 91/2026) mới dựa trên nguồn thứ cấp | cao | cần kế toán xác nhận trước khi nối nhà cung cấp thật |
| PayOS/SePay mới làm theo tài liệu, chưa thử sandbox | trung bình | cần tài khoản sandbox |
| Repo đang **public** — ai cũng đọc được code, thiết kế bảo mật, luật nghiệp vụ | trung bình | chưa có bí mật nào trong repo; đổi private thì CI GitHub Actions có hạn mức phút miễn phí |
| Máy dev thiếu RAM (swap đầy) ⇒ chỉ chạy 2 agent/lượt, cổng chạy tuần tự | thấp | đã quen; chậm hơn chứ không sai |
| 12 quyết định đang dùng giá trị đề xuất | thấp | chốt ở §8 — đổi sau vẫn được nhưng càng muộn càng tốn |

---

## 7. Chi phí

### 7.1 Tiền thật

**0 đ.** Postgres nhúng, Chrome có sẵn, GitHub public miễn phí, không thuê server, không mua dịch vụ nào.

Sẽ phát sinh khi tới vận hành (chưa tra giá — sẽ báo con số cụ thể ở đợt vận hành): server + DB + backup, tên miền, phí cổng SePay/PayOS, phí nhà cung cấp HĐĐT, tài khoản Apple Developer nếu dùng iPad, máy in nhiệt để thử.

### 7.2 Token (subagent)

| Đợt | Token | Nội dung chính |
|---|---|---|
| Nghiên cứu | 918k | 6 báo cáo (bán hàng, kho, chuỗi/khuyến mãi, HĐĐT/VietQR/in, API đối thủ, luật Odoo 18) |
| 1 | 877k | nền repo; tiền, số lượng, giờ chi nhánh, ngày kinh doanh, nhóm tùy chọn, combo, giá; DB + RLS; spike đồng bộ offline |
| 2 | 946k | tổng tiền/thuế/giảm, hủy, hoàn, quyền + vai trò mẫu, công tắc tính năng; đăng nhập, ghép máy, PIN |
| 3 | 1.235k | gắn quyền vào API, duyệt tại chỗ, kiểm cấu hình món, bảng menu + API catalog; review vòng 1 |
| 4 | 1.181k | sửa review vòng 1; bảng đơn hàng; server đồng bộ (lệnh + luồng thay đổi); gói hợp đồng dữ liệu |
| 5 | 1.397k | ca/két, in ấn, sync-client, lệnh hủy/giảm/hoàn/hủy đơn, phiếu bếp theo trạm |
| 6 | 861k (+1 lần bị ngắt do hết RAM, chưa đo) | bàn, bootstrap POS, SQLite trong trình duyệt, đồng bộ bếp/in |
| 7a | 953k | POS bán quầy, VietQR, thanh toán QR + webhook, e2e bán tiền mặt/offline |
| 7b | 1.059k | backoffice web, HĐĐT, chốt ngày, báo cáo |
| 8a | 808k | review vòng 2 (chỉ đọc) + route đọc/ghi còn thiếu |
| 9a | 574k | sửa 11 lỗi review vòng 2 |
| 9b | 965k | POS QR thật + người mua HĐĐT; backoffice cài đặt/báo cáo/chốt ngày/khớp tay/sơ đồ bàn |
| **Tổng** | **≈ 11,8 triệu** | trung bình ~0,95 triệu/đợt, ~8.000 dòng code + test/đợt |

Không tính phần phiên chính (điều phối, merge, chạy cổng, viết tài liệu).

---

## 8. Quyết định cần bạn chốt

Code đang chạy theo **cột "Đang dùng"**. Bạn chỉ cần trả lời "OK hết" hoặc ghi số dòng muốn đổi. Chi tiết từng quyết định: `docs/decision-log.md`.

### 8.1 Mười hai quyết định trong decision log

| # | Mã | Câu hỏi | Đang dùng (đề xuất) | Ảnh hưởng nếu đổi muộn |
|---|---|---|---|---|
| 1 | D-027 | Voucher 100.000 đ cho bill 80.000 đ: **từ chối** hay **giảm về 0 đ**? Phí phục vụ chịu thuế suất bao nhiêu? | từ chối; thuế suất phí phục vụ lấy từ cấu hình chi nhánh | thấp |
| 2 | D-029 | Ngưỡng của vai trò mẫu "thu ngân" | giảm dòng ≤ 10%; thu/chi két ≤ 500.000 đ; không giảm toàn đơn; pha chế không có quyền thao tác tiền | thấp (chủ quán tự sửa được) |
| 3 | D-040 | Quản lý duyệt giảm 20% thì thu ngân dùng được cho mức 19% không? Một lần duyệt gắn với một đơn? | khớp **đúng** hành động + đúng giá trị, dùng 1 lần | trung bình |
| 4 | D-052 | Giới hạn thời gian: máy offline đẩy lệnh duyệt về muộn tối đa bao lâu; lệch đồng hồ cho phép; giữ mã QR cũ bao lâu | 2 giờ · 2 phút · 7 ngày | thấp |
| 5 | D-047 | Mã QR sống bao lâu; khách chuyển **thiếu** hoặc **thừa** thì xử thế nào | 15 phút; thiếu/thừa ⇒ chưa tự xử, vào danh sách khớp tay | **cao** — cần cho R1 |
| 6 | D-026 | Thời hạn đăng nhập | backoffice 7 ngày; ca nhân viên 12 giờ; sai mật khẩu 5 lần khóa 15 phút; không có "ghi nhớ đăng nhập" | thấp |
| 7 | D-022 | Giá khung giờ qua nửa đêm (T6 22:00–02:00 có còn áp lúc 01:00 T7?) | còn — thuộc ngày bắt đầu | thấp |
| 8 | D-023 | Máy quầy ghi đĩa an toàn hay nhanh | **an toàn** (~1,5 ms/đơn, không mất đơn khi mất điện) | thấp |
| 9 | D-024 | iPad: chạy trình duyệt hay app? | iPad dùng **app** (Safari có thể xóa đơn chưa đồng bộ); trình duyệt chỉ cho điện thoại order khi có mạng | **cao** — quyết thiết bị quán thí điểm |
| 10 | D-030 | Công tắc nào bật sẵn khi tạo quán | chỉ "trả trước tại quầy" | thấp |
| 11 | D-011 | Nhiều khuyến mãi cùng lúc | không cộng dồn, chọn cái lợi nhất cho khách; chỉ cái đánh dấu "cộng dồn" mới cộng | thấp (R2) |
| 12 | D-012 | Tích điểm | tính trên tiền thực trả, làm tròn xuống; hoàn đơn trừ điểm | thấp (R2) |

### 8.2 Câu hỏi vận hành (gom từ backlog)

Cột thứ ba ghi rõ cái nào code đang chạy và cái nào mới là đề xuất (chưa có trong code).

| # | Câu hỏi | Hiện tại / đề xuất |
|---|---|---|
| 13 | Trả tiền khi máy **chưa mở ca** | đang nhận (tiền không thuộc két nào) ⇒ **đề xuất đổi: từ chối, bắt mở ca** |
| 14 | Chênh lệch két khi đóng ca bao nhiêu thì phải có quản lý duyệt | 0 đ (lệch đồng nào cũng duyệt) |
| 15 | Tiền QR thừa/khách trả 2 lần (`refundDue`): ai bấm "đã hoàn cho khách" | đề xuất: quản lý, trên backoffice, kèm ghi chú |
| 16 | Hoàn 1 trong 3 ly của đơn có giảm toàn đơn: bill hoàn in thế nào | hiện: in −28.999 và giảm −3.333 (thực hoàn −25.666 — số tiền đúng); đề xuất: in giá ly gốc + dòng "giảm theo đơn", bạn xem bill mẫu ở đợt 9d |
| 17 | Món đã hủy một phần thì không đổi topping/không thêm giảm dòng nữa — chấp nhận ở quầy? | chấp nhận |
| 18 | Số gọi món | hiện: mỗi máy tự đếm, số gọi 1–100 (offline vẫn chạy, nhưng 2 máy có thể gọi trùng số); đề xuất: thêm chữ của máy (A12, B12) |
| 19 | Nhóm tùy chọn dùng chung nhiều món (sửa ở món A ảnh hưởng món B) | đề xuất: dùng chung, sửa thì báo danh sách món bị ảnh hưởng |
| 20 | HĐĐT: đơn 0 đ có xuất không; hoàn tiền có xuất hóa đơn điều chỉnh không; ai đẩy lại hóa đơn lỗi hẳn | **chờ kế toán** — hiện: hoàn tiền chỉ ghi sổ, không xuất điều chỉnh; đơn 0 đ và đẩy lại hóa đơn lỗi hẳn chưa có luật |

---

## 9. Kế hoạch tiếp theo — cần bạn duyệt

### 9.1 Các đợt

Mỗi đợt: tối đa 2 agent chạy song song (máy thiếu RAM), mỗi agent một worktree riêng, xong thì merge + chạy đủ 4 cổng + push. Ước tính dựa trên trung bình thực đo ~0,95 triệu/đợt.

| Đợt | Làm gì | Bạn nhận được | Token ước tính |
|---|---|---|---|
| **9c** | (1) Điểm khởi động API + lệnh `pnpm dev:stack`: Postgres + migrate + **quán mẫu có sẵn menu, nhân viên, máy** + API + POS + backoffice, một lệnh chạy hết. Luật chung `createdAt` (chặn máy chạy nhanh giờ, kẹp giờ cho quyết định nghiệp vụ). (2) **POS màn bàn**: sơ đồ bàn, mở bàn, gọi nhiều lượt, gửi bếp, tạm tính, trả tại bàn, chuyển bàn | **tự bấm thử được trên máy** — quầy + bàn | 0,9–1,1 triệu |
| **9d** | (1) POS: hủy món / giảm giá / hoàn tiền có PIN quản lý duyệt, mở + đóng ca có đếm tiền, lịch sử đơn + mở lại nháp. (2) HĐĐT: sửa W9 + thêm test T1, T2 | đủ thao tác của một ca bán thật | 0,9–1,1 triệu |
| **10** | (1) Review vòng 3 cho đợt 8–9d (chỉ đọc, có probe) + sửa. (2) Vận hành: script tạo role DB, deploy 1 server, backup + thử khôi phục, giám sát lỗi, CI trên GitHub | bản chạy trên server thật cho quán thí điểm | 1,0–1,3 triệu |
| **11** | Vỏ native (Windows/Android, iPad nếu D-024 giữ nguyên) + in thật qua LAN/USB/Bluetooth + hồ sơ máy in; adapter HĐĐT thật + đối chiếu sandbox QR | máy quầy thật in bill thật ⇒ chạy song song ở quán ⇒ **R1** | 0,9–1,2 triệu |

**Tổng tới R1: ~3,7–4,7 triệu token** (cộng thêm phần sửa sau khi quán thí điểm dùng thử — chưa ước được).

### 9.2 Điều kiện dừng giữa chừng

Sau mỗi đợt mình dừng và báo nếu: một cổng đỏ mà không rõ nguyên nhân sau 1 lần sửa; agent báo phải đổi một quyết định đã chốt; vượt ước tính quá 30%; hoặc gặp việc chỉ bạn làm được. **Sau 9c mình sẽ dừng một lần** để bạn bấm thử `pnpm dev:stack` — góp ý về giao diện lúc đó rẻ hơn nhiều so với sau R1.

### 9.3 Việc chỉ bạn làm được

| Việc | Cần trước đợt | Ghi chú |
|---|---|---|
| Hồ sơ quán thí điểm (`docs/research/pilot-cafe-profile.md`) | 9c (để seed quán mẫu đúng) | số máy, số bàn, menu thật, cách quán đang làm ca/két |
| Chốt §8 | 9c | trả lời "OK hết" cũng được |
| Quyết repo **public / private** | sớm | private thì CI GitHub có hạn mức phút miễn phí |
| Hỏi kế toán về HĐĐT (NĐ 254/2026, TT 91/2026, câu 20 ở §8.2) | 11 | |
| Tài khoản sandbox SePay / PayOS | 11 | |
| Tài khoản thử nhà cung cấp HĐĐT (đề xuất 1 bên có API công khai) | 11 | |
| Máy in nhiệt (80 mm LAN + 1 máy tem) | 11 | dùng để kiểm tiếng Việt CP1258 |
| Cài Rust + Android SDK trên máy dev (hoặc cho phép mình cài) | 11 | |
| Tài khoản dùng thử KiotViet FnB / CukCuk | không gấp | để so luồng thao tác thật |

### 9.4 Cách duyệt

Trả lời ngắn theo mẫu, phần nào không nhắc là đồng ý:

```
§8: OK hết            (hoặc: OK, trừ 5 → ..., 13 → ...)
§9: chạy 9c → 9d → 10 (hoặc: chỉ chạy 9c rồi dừng / đổi thứ tự ...)
Repo: giữ public | đổi private
```

---

## Phụ lục — đọc thêm

- Bảng task + bàn giao từng phiên: `docs/tasks-r1-detailed-task-board.md`
- Quyết định D-001…D-053: `docs/decision-log.md`
- Review: `docs/research/review-wave-1-2-findings.md`, `docs/research/review-wave-3-7-findings.md`
- Luật viết test: `docs/testing-strategy-and-test-file-layout.md`
- Bản đồ tính năng theo bản phát hành: `docs/feature-map-by-release.md`
