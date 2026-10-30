# Bảng task chi tiết — tới R1

> Nguồn việc duy nhất của các phiên. Quy trình dùng: [development-workflow](development-workflow-for-claude-sessions.md).
> Trạng thái: `todo` · `doing (ngày)` · `done (ngày, commit)` · `blocked (lý do)` · `user` (việc của user, Claude chỉ nhắc/hỗ trợ).
> Mã task chỉ dùng trong tài liệu, **không** ghi vào code/test/commit.

## Bàn giao phiên trước

- 2026-10-30 — **Lượt 6c xong cả 5 mốc** (1 agent, nhánh `feat/minimum-till-release-and-delete-versions`, chưa gộp / chưa push).
  - **Commit:** `4f5965d` (mốc 1) · `724fdc3` (mốc 2) · `5c12c45` (mốc 3) · `9f79403` (mốc 4) · `2fea169` (mốc 5) · `a0925e7` (test hợp đồng danh sách nhân viên có `version`, sót ở `pnpm verify` lần đầu).
  - **Cổng** (trên worktree, chạy một lần ở cuối): `pnpm verify` unit 3.347 · `test:api` 1.868 + 7 (+1 skip) · `test:sync` 25 · `test:browser` 242 (POS 192, e2e 28 + 10, sync-client 24) · `pnpm build` — exit code 0. Test chập chờn đã biết (`sync-change-cursor-never-skips`, `home-screen.test.tsx` của trang quản lý) đỏ một lần khi chạy song song, chạy riêng xanh; không liên quan thay đổi.
  - **Mốc 1 (D-141, D-142):** `FNB_MIN_POS_BUILD` (mặc định không đặt); máy gửi số bản (giờ commit, giây) ở `x-fnb-pos-build` mọi lần đồng bộ; máy chủ trả 426 `API_POS_RELEASE_TOO_OLD` sau kiểm thông tin ghép; lệnh nằm lại outbox; màn "Cần cập nhật máy bán hàng". Máy không gửi header luôn được nhận. `install-release.sh` chép `assets/` mà bản trước tự phát hành. `SyncTransportError.code` mới.
  - **Mốc 2 (D-143, D-144):** 401 `API_DEVICE_UNAUTHENTICATED` → màn "Máy này đã bị gỡ khỏi cửa hàng" (liệt kê thao tác chưa gửi, xóa cần xác nhận lần hai), `LocalStore.wipe()`, về màn ghép kèm câu giải thích. `DELETE /pos/staff-sessions/current` + nút Đăng xuất (không gọi khi còn lệnh của phiên chờ gửi).
  - **Mốc 3 (D-145):** `?version=` bắt buộc ở `DELETE` danh mục / trạm / bảng giá / khu vực / bàn và `PATCH /staff/:id`; 409 `API_CATALOG_VERSION_CONFLICT` / `API_FLOOR_VERSION_CONFLICT` / `API_STAFF_VERSION_CONFLICT`; trang quản lý báo và tải lại. `GET /staff` thêm `version`.
  - **Mốc 4 (D-146):** migration `0039_station_archive`; xóa trạm = xóa hẳn hoặc lưu trữ; còn món đang bán gán thì chặn; "Dùng lại" (`POST /catalog/stations/:id/unarchive`).
  - **Mốc 5 (D-147):** `useFinishThen` (hủy món, hủy đơn, giảm giá, duyệt, tùy chọn, combo), `Presence` (thẻ xác nhận + thông báo trong trang của đơn bàn), `SlipPaper` + lưới phiếu `auto-fit` (xem trước phiếu đọc hết ở 360–1920 px).
  - **Hợp đồng:** máy quầy gửi thêm header `x-fnb-pos-build` (máy chủ cũ bỏ qua). Không trường mới vào bootstrap, kết quả lệnh hay bản sao đổi chung; trạm lưu trữ tới máy quầy như trạm bị xóa (`snapshot` null). Trang quản lý: `GET /staff` và `GET /catalog/stations` thêm `version` / `archivedAt` (chỉ trang quản lý đọc), `DELETE` các route trên đổi hợp đồng (`?version=`; trạm trả 200 `{id, outcome, version}`).
  - **Sổ tay:** `may-quay/01, 10, 12`, `quan-ly/03, 06, 07, 08, 14, 15`, `van-hanh/06`; ảnh mới `update-required`, `till-revoked`, `tram-pha-che-luu-tru`; các ảnh phiếu (`close-shift-slip`, `sale-done`, `sale-done-invoice`, `table-slips`, `refund-and-close-slips`) chụp lại; ảnh còn lại chưa chụp lại sau lượt này.
  - **Biết trước / chưa làm:** (1) vai trò (`PATCH` / `DELETE` / archive `/roles/:id`), khóa / mở lại / đặt lại PIN nhân viên vẫn ghi sau thắng (Backlog); (2) mẫu loại quán đọc trạm đang dùng, chưa có test riêng cho nhánh trạm lưu trữ; (3) trạm lưu trữ chưa có kịch bản `test:sync` (feed kiểm ở test API); (4) tải lại thành công mà vẫn bản cũ (cache) sẽ hiện lại màn cập nhật bắt buộc (đã ghi ở sổ tay); (5) `dismiss-rejection-screen` chưa đi qua `useFinishThen`.
  - **Phiên sau:** đợt 7 theo Backlog `[đợt 7]`; trước đó chụp lại toàn bộ ảnh sổ tay sau khi gộp.

- 2026-10-30 — **Lượt 6b xong mốc 1, 2, 3, 6; mốc 4, 5, 7, 8, 9 CHƯA làm** (1 agent, hết ngân sách: 0,51M token theo số đo hệ thống, nhánh `feat/needs-attention-actions-flags-and-item-codes`, gộp `5556140`).
  - **Commit:** `1bbe2ee` (mốc 1) · `310d9c6` (mốc 2) · `720e938` (mốc 3) · `bab587c` (mốc 6) · `b1ae483` (test đăng ký lệnh) · `8bc6700` (sửa khi review: quán mẫu `dev:stack` bật `kitchen_routing` + `cup_labels` như mẫu quán cà phê, nếu không quán mẫu mất phiếu theo trạm và tem ly sau khi ba công tắc được nối thật) · `33ec8af` (sửa khi soát ảnh: "Cần xử lý" hiện `order.cancel` thay vì "Hủy đơn"; thêm tên tiếng Việt cho 6 lệnh còn thiếu, test đối chiếu mọi lệnh trong `SYNC_COMMANDS` của máy chủ).
  - **Cổng khi gộp** (chạy lại không cache trên nhánh, cây trùng bản gộp): unit 3.295 · `test:api` 1.834 + 7 · `test:sync` 24 · `test:browser` 241 (POS 180, e2e 28 + 10, sync-client 23) · build — xanh. Lần chạy trước đó đỏ một test trang quản lý không liên quan (`stations-screen.test.tsx`, chờ chữ báo lỗi quá 1 s khi máy tải nặng; chạy riêng 3/3 xanh). Ảnh sổ tay chụp lại toàn bộ sau gộp.
  - **Cổng:** `pnpm verify` xanh (unit: pos 704, backoffice 619, api 364, contracts 391, domain ≈ 893, sync-client 78, printing 96, feature-flags 42, db 31, shop-templates 11); `test:api` 1.833 + 1 skip, **1 đỏ chập chờn** `sync-change-cursor-never-skips` (timeout 30 s khi cả bộ chạy song song; chạy riêng 4/4 xanh, không đụng tới feed); `test:sync` 24; `test:browser` 233 (POS 180, e2e 28 + 10, sync-client 23 − gộp); build xanh.
  - **Mốc 1 (D-137):** "Cần xử lý" có nút theo loại lệnh (làm lại trên bản mới, mở đơn / bàn kể cả "xin duyệt rồi gửi lại", đóng đơn QR, bỏ qua có lý do). Lệnh mới `sync.rejection_dismissed` ghi `audit_log`; lệnh có tiền / phiếu bếp bắt buộc lời ghi. `SyncClient.resolveRejected` nhớ bền. **Sửa lỗi máy chủ:** `order.cancel` tính nhầm dòng hủy là bếp "còn món" ⇒ hủy đơn sau hủy món nhiều lượt bị từ chối (test mới tái hiện).
  - **Mốc 2 (D-138):** `cup_labels`, `kitchen_routing`, `happy_hour_pricing` nối thật (máy chủ định giá nháp theo cùng công tắc); `pay_first_counter` khóa ở bật, các công tắc chưa làm khóa + "Sắp có", `einvoice` chỉ dẫn tới hồ sơ; `planTemplate` bỏ qua công tắc khóa. B1, B2, Q13 gỡ. **Đổi hành vi mặc định:** 3 công tắc đó mặc định tắt ⇒ quán đang chạy mất tem ly / chia phiếu / giá giờ cho tới khi bật.
  - **Mốc 3 (D-139):** migration `0038_product_code` (cấp mã cho món đang có bằng cách tắt / bật RLS của bảng trong giao dịch, có test migration thật). Ô Mã hàng, cột + tìm theo mã, nhập Excel khớp mã trước tên, xuất Excel có mã. **`code` chưa vào bootstrap / feed máy quầy** (lệch có chủ ý, xem D-139 + Backlog `[đợt 7]`).
  - **Mốc 6 (D-140):** số lượng lẻ của món đếm cái và combo trỏ combo / món ngừng bán bị máy chủ từ chối.
  - **Hợp đồng:** máy quầy không đổi trường nào (công tắc đã nằm sẵn ở `config.flags`). `GET /settings` thêm `support` cho từng công tắc (tùy chọn). `ProductDocument` + danh sách món thêm `code`; thân `PUT /catalog/products/:id` thêm `code` tùy chọn. Lệnh mới `sync.rejection_dismissed`: máy bản mới gửi lên máy chủ bản cũ sẽ bị từ chối lệnh không biết (máy chủ phát hành trước máy quầy, theo quy tắc mở rộng rồi mới thu hẹp).
  - **Sổ tay:** `may-quay/03, 06, 09, 10`, `quan-ly/03, 05, 09, 14, 16`; B1, B2, Q13 gỡ. Ảnh "Cần xử lý" có thao tác: đã thêm vào dữ liệu chụp (`pretty-entry-screens.tsx`, `screens-page.tsx`), đã chụp lại sau khi gộp.
  - **Chưa làm (giữ nguyên dòng `[đợt 6]` ở Backlog):** mốc 4 ép phiên bản máy quầy tối thiểu + chép `assets/` của bản trước (T11-04); mốc 5 máy bị thu hồi + route đăng xuất phiên nhân viên; mốc 7 kiểm `version` khi xóa / sửa nhân viên; mốc 8 lưu trữ trạm; mốc 9 hiệu ứng đóng ở đường "xong việc", thẻ xác nhận, phiếu chốt ca xem trước bị cắt.
  - **Phiên sau:** lượt 6c, theo thứ tự mốc 4, 5, 7, 8, 9 (cần chủ dự án duyệt token: ngoài ước tính hai lượt đã duyệt).

- 2026-10-30 — **Lượt 6a (khóa món đã gửi bếp, số gọi nhiều máy, phiếu đóng ca) xong mốc 1–3; mốc 4 "Cần xử lý" CHƯA làm** (1 agent, 0,47M token theo số đo hệ thống, nhánh `feat/kitchen-lock-call-numbers-and-needs-attention`, gộp `e472c66`).
  - **Commit:** `202ee0b` (mốc 1) · `9ac1563` (mốc 2) · `4005c7c` (mốc 3) · `57b0333` (bàn giao).
  - **Cổng** (chạy lại không cache trên nhánh, cây trùng bản gộp): unit 3.241 · `test:api` 1.805 + 7 · `test:sync` 24 · `test:browser` 240 (POS 180, e2e 28 + 10, sync-client 22) · build — xanh. Lỗi 401 chập chờn của `test:api` không hiện lại. Ảnh sổ tay chụp lại toàn bộ sau gộp.
  - **Mốc 1 (D-131…D-134):** phiếu bếp chỉ xem trên màn tính là đã gửi (khóa món, hủy món xin duyệt + phiếu hủy); máy in lỗi thì chưa gửi; hủy lần cân nguyên; nút "Trả bàn"; đổi tùy chọn món đã gửi = hủy + gọi lại; sửa `kitchenStillHasItems` (dòng hủy không còn bị tính là bếp còn món).
  - **Mốc 2 (D-135):** migration `0037_device_call_index`; bootstrap kèm `callNumbering` chỉ khi máy xin `?call-numbering=1`; số gọi = chỉ số × 100 + (số đơn mod 100) từ 2 máy; dải "Đơn số N chưa thanh toán" (Mở lại / Hủy đơn).
  - **Mốc 3 (D-136):** `shiftVersion` ở kết quả `order.pay` / `order.refund` / `shift.cash_move` (header `x-fnb-sync-features`), cột `outbox.shift_version`, tiền dự kiến giữ khoản tới khi bản sao ca đạt version; đóng ca chờ máy chủ ≤ 10 s, phiếu tạm + "In bản chính thức".
  - **Hợp đồng:** các trường mới đều tùy chọn và chỉ gửi cho máy xin (máy cũ parse nghiêm sẽ hỏng nếu gặp trường lạ).
  - **Sổ tay:** `may-quay/03, 05, 06, 07, 10`, `quan-ly/07`; Q16 gỡ; ảnh mới `unpaid-orders-strip` (đã có file; các ảnh khác chưa chụp lại).
  - **Phiên sau:** lượt 6b, mở đầu bằng "Cần xử lý xử lý được từng lệnh" (dòng Backlog `[đợt 6]` mới nhất), rồi các dòng `[đợt 6]` còn lại.

- 2026-10-29 23:30 — **Đợt 5 (giao diện máy quầy + ô chọn trang quản lý) xong** (1 agent, **0,41M token** theo số đo của hệ thống, merge `d824c0e`).
  - **Review khi gộp:** ngăn thanh toán ở 1280×800 đẩy bàn phím số xuống thấp hơn bản cũ một hàng ⇒ màn thấp (≤ 860 px) đặt hai thẻ nằm ngang, biểu tượng cạnh chữ (`aecd5fc`).
  - **Cổng trên `main`:** unit 3.208 · `test:api` 1.802 (+1 skip) · `test:sync` 22 · `test:browser` 237 (POS 177, e2e 28 + 10, sync-client 22) · build · `release:pack` (`0.0.0+d824c0e`).
    - `test:api` đỏ lần đầu ở bước dựng dữ liệu của `money-the-bank-brought-is-never-dropped.test.ts` (ghép máy trả 401), không liên quan đợt này (không đổi API / DB).
    - Chạy riêng file đó 3/3 xanh, chạy lại cả bộ cũng xanh. Đã ghi Backlog `[đợt 7]`.
  - **Commit:** `f5d5cec` (ô chọn) · `0f355ba` (hiệu ứng đóng) · `ceb97b5` (đăng nhập) · `6401825` + `571bddb` (dải cập nhật) · `802300b` (ca, thu chi) · `f3ad6f7` (thanh toán).
  - **Ô chọn trang quản lý** (D-125): `Listbox` có ô tìm bỏ dấu (> 8 mục hoặc `searchable`), bàn phím đủ, "Không tìm thấy"; cả 12 `SelectField` ở 9 file đã đổi, `SelectField` gỡ (`CheckField` sang `check-field.tsx`). Test chọn dùng `test-support/pick-from-listbox.ts`, e2e dùng `choose`.
  - **Hiệu ứng đóng** (D-126): `usePresence` ở cả hai app, gỡ bằng hẹn giờ, đóng là CSS transition nên mở lại giữa chừng không nháy; áp cho danh sách `Listbox`, menu ngang, ngăn kéo menu, menu giao diện máy quầy, 6 bước phủ lên đơn (đường Quay lại).
  - **Nhóm đăng nhập máy quầy** (D-127): `ScreenFrame stage` — thẻ giữa màn cho ghép máy, chọn nhân viên (30 người cuộn trong thẻ), PIN (chấm, xóa số cuối, rung khi sai), sự cố, tab khác. Test bố cục 5 khổ ở `gate-screens-centred-in-chrome.test.ts`.
  - **Dải cập nhật** (D-128): `TillFrame` đặt dải đầu màn, chiếm chỗ riêng, thu nhỏ được; không đổi `update-policy.ts`.
  - **Mở ca / đóng ca / thu chi** (D-129): `ShiftPanel`, hai thẻ từ 1100 px, không đổi nghiệp vụ.
  - **Ngăn thanh toán** (D-130): khối Cần thu thương hiệu, hai thẻ có dấu tích, nút gợi ý cao.
  - **Sổ tay:** `may-quay/01, 02, 04, 07, 11, 12`, `quan-ly/01, 03, 14`; toàn bộ ảnh chụp lại trên `main` sau khi gộp. Ảnh mới: `update-banner-folded`.
  - **Biết trước:** xem các dòng Backlog `[đợt 6]` / `[thấp]` ghi 2026-10-29 vừa thêm (đường đóng "xong việc", `usePresence` hai bản, QR / ví).
  - **Phiên sau:** đợt 6 theo Backlog (cần chủ dự án duyệt token).

- 2026-10-29 22:00 — **Rà xong Backlog cũ** (không agent, chỉ sửa tài liệu).
  - Kiểm 97 dòng ghi 2026-10-20 … 10-28 bằng grep trong code.
  - Khoảng 55 dòng đã xong nhưng chưa gạch. Gom vào "Đã xong khi rà", mỗi dòng kèm file hoặc quyết định làm bằng chứng.
  - Còn mở, xếp theo nhãn:
    - đợt 5: 1 dòng — **12** ô chọn của trình duyệt ở 9 file (trước ghi 8);
    - đợt 6: 8 dòng;
    - đợt 7: 7 dòng;
    - sau R1: 6; thấp: 11; R2: 4; khi làm luồng đó: 1.
  - Việc chờ máy in, kế toán, ví, HĐĐT chuyển sang [release-r1-waiting-on-real-things-checklist.md](release-r1-waiting-on-real-things-checklist.md).
  - Dòng "chưa kiểm lại" là chưa tìm thấy bằng chứng trong code: đợt được gắn phải kiểm trước khi làm.
  - **Phiên sau:** đợt 5 (cần chủ dự án duyệt token).
- 2026-10-29 17:30 — **Đợt 4 (vận hành) xong** (1 agent, 0,42M token, merge `8656a65`).
  - **Thu lỗi máy quầy / trang quản lý** (T11-01, D-122):
    - Gửi `POST /client-errors` về server của mình, không dùng dịch vụ ngoài.
    - Che email / số dài / token, cắt query; chỉ ghi id thiết bị / tài khoản vào cùng nhật ký với lỗi server; giới hạn tần suất.
    - Máy quầy giữ lỗi lúc mất mạng (localStorage, tối đa 50, gộp trùng 60 s); có màn sự cố "Tải lại" ở máy quầy và trang sự cố ở trang quản lý.
  - **Cập nhật app quầy bản web** (T11-04, D-123):
    - Build đóng dấu mã bản + `version.json`; máy quầy hỏi 5 phút một lần, bản **khác** là có cập nhật, nên quay lui cũng tới máy.
    - Không bao giờ tải lại khi còn lệnh chưa gửi hoặc đang mở hộp thoại.
    - Không có ca thì tự cập nhật sau 20 s không ai chạm; có ca thì hiện thẻ "sẽ cập nhật sau khi đóng ca" kèm nút "Cập nhật ngay".
  - **Đóng gói bản phát hành** (T11-05 một phần, D-124):
    - `pnpm release:pack` tạo tarball + checksum + manifest; CI đóng gói và lưu artifact 14 ngày.
    - `infra/release/install-release.sh` làm tuần tự: kiểm checksum → cài phụ thuộc prod → backup → migration → đổi `current` → kiểm `/health`. Hỏng thì tự về bản trước và gạt bản hỏng sang `.failed-*`.
    - `rollback-release.sh` từ chối quay lui qua migration.
    - Hai script giữ khóa `/srv/fnb/.release.lock`; khóa và việc gạt bản hỏng là sửa sau review (`16319c0`).
    - Thử trên thư mục giả với lệnh giả; **không đẩy lên server thật** (chưa có server, deploy thật phải hỏi chủ dự án).
  - **Danh sách việc chờ đồ thật** (server / máy quầy / máy in / tài khoản / quán thí điểm): [release-r1-waiting-on-real-things-checklist.md](release-r1-waiting-on-real-things-checklist.md). Luật: dời việc vì cần đồ thật thì thêm dòng ở đó trong cùng commit.
  - **Sổ tay:**
    - Trang mới: `may-quay/11-man-hinh-su-co`, `may-quay/12-cap-nhat-ban-moi`, `quan-ly/17-trang-su-co`, `van-hanh/05-nhat-ky-loi…`, `van-hanh/06-ban-phat-hanh-va-quay-lui`.
    - Ảnh chụp lại toàn bộ (mới: `crash`, `update-banner`, `trang-su-co`).
  - **Cổng trên bản merge:** unit 3.171 · `test:api` 1.802 (+1 skip) · `test:sync` 22 · `test:browser` 200 · build · `release:pack` — xanh.
  - **Biết trước** (đã thành dòng Backlog có nhãn đợt):
    - Thẻ cập nhật đè góc lưới món; màn sự cố trống phía dưới (đợt 5).
    - Chưa ép phiên bản tối thiểu; tab mở từ bản cũ có thể lỗi chunk `assets/` đã xóa (đợt 6).
    - Code thu lỗi của trang quản lý chép lại ~100 dòng của máy quầy (không có gói DOM dùng chung).
    - Màu chủ đạo theo token sẵn có của giao diện "pastel" (xanh dương), không đổi.
  - **Phiên sau:**
    1. Tự rà ~105 dòng Backlog cũ (60–90k, không agent): đánh dấu dòng đã xong, gắn nhãn đợt cho dòng còn mở.
    2. Đợt 5: vẽ lại mở/đóng ca, PIN, chọn nhân viên, ghép máy, ngăn kéo thanh toán, màn sự cố, 12 ô chọn (rà 22:00), hiệu ứng đóng, ô tìm trong `Listbox`.
    3. Đợt 6: D-097, D-096, D-083, D-095, D-082, "Cần xử lý" từng lệnh, ép phiên bản tối thiểu, giữ `assets/` bản trước, lưu trữ trạm.
    4. Đợt 7: quán giả lập.
  - **Đang chờ chủ dự án:** link repo game giả lập bán hàng (xem Backlog 2026-10-29).

- 2026-10-29 12:30 — **Chốt ngày theo lời chủ dự án (đợt 3 xong thì dừng).** **Đợt 3** (1 agent, 0,49M token, merge `729a459`): trang quản lý có **Bảng giá** (danh sách + sửa quy tắc giảm % / giá cố định theo phạm vi, chi nhánh, kênh, ngày, giờ; máy chủ thêm danh sách + xóa, D-117), **Trạm pha chế** (thêm / đổi tên / xóa trạm chưa có món và chưa in phiếu, D-118), **Mẫu loại quán** (`packages/shop-templates`, 5 mẫu, xem trước rồi áp, chỉ thêm cái còn thiếu, công tắc người dùng đã chọn giữ nguyên, D-119), **bán lại món đã ngừng** (`POST /catalog/products/:id/unarchive`, nút "Bán lại món", dòng B5 bỏ khỏi `discrepancies.md`, D-120), quán mẫu `pnpm dev:stack` có "Combo đôi" (16 món, D-121). Màn máy in (T04-14) **dời** tới lúc có vỏ Windows + máy in thật. Ảnh sổ tay chụp lại toàn bộ (thêm `bang-gia`, `bang-gia-sua`, `tram-pha-che`, `mau-loai-quan`). Cổng trên bản merge: unit 3.097 · `test:api` 1.789 · `test:sync` 22 · `test:browser` 194 · build — xanh (`pnpm test:ops` không chạy ở máy này vì cần pg_dump ≥ 17; CI cài client 17 và chạy, xanh ở `eef352f`). **Biết trước** (đã thành dòng 2026-10-29 trong Backlog, gắn đợt): công tắc mẫu áp `pay_first_counter`, `kitchen_routing`, `course_firing`, `cup_labels` chỉ được lưu, máy quầy chưa đọc (cùng gốc với B1/Q13 — đợt 6); món thuộc cả thương hiệu nhưng trạm thuộc một chi nhánh ⇒ ở chi nhánh khác món đó không ra phiếu (có từ trước, ghi ở trang sổ tay 15); trạm đã từng in phiếu chỉ đổi tên được, không xóa; quy tắc có kênh không áp ở quầy; ô chọn món của bảng giá chưa có tìm kiếm; ngày của bảng giá tính theo UTC+7 cố định. **Phiên sau bắt đầu ở đợt 4** (vận hành: thu lỗi từ máy quầy / trang quản lý, cập nhật app quầy, pipeline deploy — không deploy thật), rồi đợt 5 → 6 như dòng 2026-10-28 12:05. Không còn worktree; dev stack đang tắt.

- 2026-10-28 14:30 — **Chốt ngày theo lời chủ dự án (hôm sau làm tiếp từ đợt 3).** **Đợt 2 combo** xong (1 agent, 0,49M token, merge `87ba93f`): trang quản lý tạo/sửa combo (phần combo, món + size + phụ thu, lỗi đặt đúng chỗ, xem trước); `save_draft` mang `comboPicks`, máy chủ tính giá bằng `domain` (`resolveComboPicks`) và lưu cây dòng combo → món → tùy chọn, chặn món hết/đã ngừng; máy quầy bán combo bằng màn chọn combo, phiếu bếp chia từng món theo trạm, bill thụt tùy chọn (D-113…D-116, D-048 bị thay một phần). Ảnh sổ tay chụp lại toàn bộ + ảnh mới màn chọn combo (combo mẫu "Combo đôi" chỉ có trong bộ chụp ảnh). Cổng sau merge: unit 3.016 · `test:api` 1.752 · `test:sync` 22 · `test:browser` 188 · build — xanh; CI xanh tới `4b82bc8`. Hôm nay tổng ~1,6M token agent (đợt 1: 1,14M, đợt 2: 0,49M). **Biết trước:** combo in lỗi ở một trạm thì lần gửi sau in lại ở MỌI trạm (chấp nhận trùng phiếu hơn mất món, D-114); hủy/hoàn chỉ cả combo (D-115); ô Danh mục / Trạm trong trình sửa món vẫn là ô chọn kiểu hệ điều hành (nằm trong 8 ô của đợt 5); quán mẫu `pnpm dev:stack` chưa có combo nào để bấm thử. **Phiên sau bắt đầu ở đợt 3** (1 agent ~500k): thêm combo vào quán mẫu dev stack; màn bảng giá (T03-06), màn trạm pha chế (T03-07), màn máy in + gán trạm (T04-14), mẫu cài đặt theo loại quán (T03-10), bán lại món đã ngừng (`discrepancies.md` B5). Sau đó đợt 4 → 6 như dòng 12:05. Không còn worktree; dev stack đang tắt.

- 2026-10-28 12:05 — Chủ dự án: "fix và làm nốt phase". **CI** đỏ 1 lần ở `d85ff40` (test trình sửa món, không tái hiện được) ⇒ test đọc lại ô sau khi lưu (`5aa6cc6`), CI xanh lại. **Bảng task** ghi đủ trạng thái từng task (`a14eca9`). **Đợt 1** (2 agent, 1,14M token — gấp đôi mức ~500k, từ đợt 2 chỉ 1 agent, cổng đủ chạy 1 lần cuối): hoàn tiền phải thuộc ca, duyệt chuyển bàn gắn đơn, thối QR thừa vượt ngưỡng xin quản lý tại máy, lý do "Khác" bắt buộc ghi chú (migration 0035), ngày dd/mm/yyyy (D-108…D-112); bán món giá nhập tay (duyệt gắn dòng + đúng giá) và theo cân kg / 100 g nhập gam (migration 0036, D-105…D-107). Dọn 21/26 chỗ lệch ở `handbook/discrepancies.md` (feature-map, logic-catalog, 3 dòng quyết định đã bị thay; trạng thái hóa đơn bằng chữ ở Chốt ngày, câu báo giới hạn tần suất ở trang quản lý, chữ "0,01–100" ở ô giảm giá) + test cho số đơn/số gọi và ô gõ mức giảm. Chụp lại toàn bộ ảnh sổ tay sau gộp (từ nay sau MỖI lần gộp). Cổng: unit 2.952 · `test:api` 1.737 · `test:sync` 22 · `test:browser` 185 · build — xanh. **Kế hoạch còn lại** (mỗi đợt 1 agent ~500k): 2 combo (đang chạy, `../worktrees/combo`) → 3 màn bảng giá + trạm + máy in + mẫu loại quán + bán lại món đã ngừng → 4 vận hành (thu lỗi máy khách, cập nhật app quầy, pipeline deploy — không deploy thật) → 5 vẽ lại mở/đóng ca, PIN, chọn nhân viên, ghép máy, ngăn kéo thanh toán, 8 ô chọn, hiệu ứng đóng → 6 D-097 khóa món đã gửi bếp bản web, D-096 công tắc trung thực, D-083, D-095 mã hàng, D-082, "Cần xử lý" từng lệnh. Chờ chủ dự án: vỏ Windows/Android + máy in thật, sandbox HĐĐT, kế toán, quán thí điểm, deploy thật.

- 2026-10-28 05:15 — **Dừng lúc 6h theo lời chủ dự án.** Đêm nay: (1) sửa lỗi phiếu in CI bắt được 22/10 (`f054b20`): tên/ghi chú bắt đầu bằng xuống dòng làm số tiền in trên dòng trống phía trên tên; (2) **QR thiếu/thừa** D-080/D-081 (~0,39M token, migration 0033, 0034): thu nốt tiền mặt hoặc QR phần còn lại, thối tiền thừa từ két (lệnh `payment.hand_back_excess`, chi két của ca), backoffice hoàn tiền QR "Tiền mặt từ két / ngoài két / chuyển khoản", hoàn chuyển khoản chỉ khi đơn có QR; (3) **giao diện mới** cho sơ đồ bàn, đơn bàn, lịch sử đơn dạng bảng (D-094, snapshot đơn có `paidAt`), nút chuyển thu/chi (~0,28M). Cổng: unit 2.866 · `test:api` 1.720 · `test:sync` 22 · `test:browser` 179 · build — xanh. **Còn:** mở ca, đóng ca, nhập PIN, chọn nhân viên, ghép máy chưa vẽ lại; ngày ở lịch sử đơn đang hiện `2026-10-21` (nên `21/10/2026`); thối tiền thừa vượt ngưỡng chưa có bước xin quản lý duyệt tại máy (server từ chối ⇒ nằm lại danh sách cần hoàn); ảnh sổ tay cho trạng thái QR thiếu/thừa chưa chụp; 8 ô chọn biểu mẫu trang quản lý còn kiểu hệ điều hành; ghi chú bắt buộc khi lý do "Khác".

- 2026-10-22 17:45 — **Giao diện đổi được** (D-103, chủ dự án muốn xanh dương pastel + chọn giao diện + chế độ tối): máy quầy và trang quản lý có nút "Giao diện" trên thanh đầu trang — Xanh pastel (mặc định) · Rang xay · Tối · Theo máy; nhớ theo máy (`fnb.theme`), áp trước lần vẽ đầu; test tương phản ≥ 4.5:1 cho mọi giao diện ở cả hai ứng dụng (~0,58M token, 2 agent). Sửa nhỏ (D-104, ~0,22M): tên quán hiện đủ ở 1280, phiếu in xem trước luôn là giấy trắng, `theme-color` theo giao diện. Ảnh sổ tay chụp ở Xanh pastel. Cổng: unit 2.844 · `test:api` 1.706 · `test:sync` 22 · `test:browser` 179 · build — xanh. Việc giao diện còn lại: ngăn kéo thanh toán / bàn / lịch sử / ca của máy quầy chưa vẽ lại hết; 8 ô chọn biểu mẫu trang quản lý còn kiểu hệ điều hành; hiệu ứng khi đóng. Việc tiền còn chờ: D-080/D-081 QR thiếu/thừa.

- 2026-10-22 16:25 — Chủ dự án xem bản chạy thật và chê: chữ có chân, đầu trang thô, ô chọn kiểu hệ điều hành, nút xác nhận như bị khóa, danh sách dài tràn, lỗi biểu mẫu xô lệch, không có hiệu ứng, giao diện dồn trái ⇒ đợt sửa 2 agent song song (máy quầy ~0,23M, trang quản lý ~0,41M): **D-101** máy quầy Be Vietnam Pro + hiệu ứng ≤ 200 ms + màn rộng giãn + link ghép máy một chạm `?pair=` (bộ chạy thử in sẵn); **D-102** trang quản lý Rang xay + Be Vietnam Pro, bố cục giãn theo màn (bỏ 1680px của D-073), ô chọn / xác nhận / ô nhập / bảng phân trang dùng chung, hiệu ứng mở. Cổng: unit 2.783 · `test:api` 1.706 · `test:sync` 22 · `test:browser` 165 · build — xanh. Còn: 8 ô chọn biểu mẫu vẫn kiểu hệ điều hành; hiệu ứng đóng; ngăn kéo thanh toán/bàn/lịch sử/ca máy quầy chưa vẽ lại hết theo bản mẫu; thẻ số liệu lẻ hàng ở tổng quan điện thoại; logo trang đăng nhập.

- 2026-10-22 14:35 — **Giao diện mới "Rang xay"** (D-099, chủ dự án chọn từ 3 hướng vẽ thử ở `~/FileMySelf/FNB-POS/ui-directions-2026-10-22/`, ngoài repo): **đợt 1** xong (~0,45M token, D-100) — token màu/chữ/độ sâu chung cho máy quầy, font Fraunces + Plus Jakarta Sans đóng gói kèm app, màn bán hàng theo bản vẽ với thẻ món nhỏ hơn (5 cột ở 1280, 7 ở 1920), nhãn "Bán chạy", 35 ảnh sổ tay chụp lại. Cổng: unit 2.759 · `test:api` 1.706 · `test:sync` 22 · `test:browser` 159 · build — xanh. **Đợt 2:** ngăn kéo thanh toán, bàn, lịch sử, ca, đăng nhập theo bản vẽ A; giá cỡ thứ hai trên thẻ; dòng giỏ ở 1024px. **Đợt 3:** trang quản lý — bảng màu A, chữ KHÔNG chân (chủ dự án thấy chữ có chân khó đọc ở trang quản lý). Còn chờ: D-080/D-081 QR thiếu/thừa.

- 2026-10-22 11:30 — **Đợt 10b** (2 agent song song: ZaloPay ~0,44M token, trả tiền thuộc ca ~0,35M — tổng ~0,78M, vượt mức ~500k đã hẹn vì ZaloPay phải dựng cả lớp ví chung): (1) **cổng ví ZaloPay** (D-098) — lớp ví chung thay thế nhau được (thêm MoMo/VNPay = thêm một bộ chuyển), migration 0032, mục "Ví điện tử" ở Cài đặt (khóa niêm phong, chỉ manage_settings), thẻ ZaloPay trong ngăn kéo thanh toán khi chi nhánh bật, thông báo của ví + vòng hỏi lại trạng thái; đã gọi thử sandbox ZaloPay thật (tạo đơn + hỏi trạng thái được; khóa mẫu không ghi vào repo); (2) **trả tiền phải thuộc một ca** (D-078): server từ chối `SYNC_PAYMENT_NEEDS_SHIFT`, "Cần xử lý" mở ca trước rồi mới đóng đơn QR, ngưỡng chênh lệch đóng ca giờ tới được máy quầy (trước đây máy luôn coi = 0 — lỗi thật). Ảnh Cài đặt trong sổ tay chụp lại (mục "Ví điện tử" nằm dưới mép ảnh — chưa có ảnh riêng, thêm vào script chụp ở đợt sau). Cổng trên bản merge: unit 2.750 · `test:api` 1.706 · `test:sync` 22 · `test:browser` 154 · build — xanh.
- Chủ dự án cần thử tay: quét mã ZaloPay trên máy quầy bằng app **ZaloPay Sandbox** (sandbox trả `order_url`, chưa có `qr_code` ⇒ mã QR đang mã hóa đường link). Lên server thật cần `FNB_PUBLIC_API_URL` để ZaloPay gọi về.
- Đợt tiếp: D-080/D-081 QR thiếu/thừa + trả tiền QR từ két → D-097 khóa món đã gửi bếp trên bản web → D-083 phiếu đóng ca theo server → … (như dòng 2026-10-21 17:00). MoMo / VNPay khi có tài khoản thử.

- 2026-10-21 17:00 — **Dừng theo lời chủ dự án (mai bảo tiếp mới làm).** Hôm nay: (1) sổ tay sản phẩm `docs/handbook/` xong + merge (`59e5fb8`): máy quầy 10 trang, quản lý 13, vận hành 4, 60 ảnh, test chặn sót; (2) rà 2 nhóm câu hỏi treo (tiền; bàn/vận hành — bản tra cứu chi tiết để NGOÀI repo ở `~/FileMySelf/FNB-POS/research/decision-sweep-*.md` vì có trích mã POS tham khảo) ⇒ chốt **D-076…D-097**; (3) **đợt 10a** (2 agent, ~0,55M token): D-076 duyệt tại chỗ gắn với đơn/dòng/ca + đúng con số (lỗ: duyệt hoàn 25.000 dùng được cho 2.000.000 ở đơn khác), D-077 máy quầy lấy giờ theo server, lệnh nhanh > 2′ được "thử lại" thay vì bị từ chối vĩnh viễn (lỗ: mất lệnh trả tiền). Cổng trên bản merge: unit 2.717 · `test:api` 1.683 · `test:sync` 22 · `test:browser` 154 · build — xanh. Luật mới của chủ dự án: **tối đa 1–2 agent một lúc, mỗi đợt ~500k token**; **luật 10 `CLAUDE.md`: sổ tay sửa cùng commit với tính năng**.
- Đợt tiếp (mỗi đợt ~500k, an toàn tiền trước): D-078 trả tiền phải thuộc ca → D-080/D-081 QR thiếu/thừa + trả tiền QR từ két → D-097 khóa món đã gửi bếp trên bản web + chữ ô % giảm → D-083 phiếu đóng ca theo server → D-096 công tắc trung thực → D-089 STALE/món mất → D-088 bàn → D-095 mã hàng → còn lại theo decision-log. Việc tài liệu: sửa feature-map + logic-catalog theo `handbook/discrepancies.md`.
- **Chờ chủ dự án:** (a) cổng ví MoMo / ZaloPay / VNPay (khách quét là ví khóa đúng số tiền): đồng ý cho gọi sandbox + đăng ký tài khoản thử MoMo for Business / VNPay; đề xuất làm ZaloPay trước (có khóa mẫu công khai); (b) quán nhỏ dùng tối giản: còn thiếu màn tự đăng ký quán, mẫu cài đặt "Quán nhỏ", in giấy thật (cần vỏ Windows + máy in thật) — chọn đợt nào làm; (c) như cũ: đối soát HĐĐT trùng (kế toán), URL ping backup + đích rclone, khóa thanh toán trên server thật.

- 2026-10-21 15:25 — **Chủ dự án giao quyền quyết định** (luật 7 trong `CLAUDE.md`): câu hỏi nghiệp vụ/UX/kỹ thuật tự tra (code, empos chỉ đọc, KiotViet/Sapo/iPOS/Toast/Odoo, internet) → quyết → làm → ghi decision-log → báo; tự giao agent không xin từng lần. Các quyết định "chờ user" cũ tự chốt khi việc cần tới. Đã duyệt + merge + push `1a249e1`: 3 thay đổi giao diện (D-073: POS thanh toán ngăn kéo 2 thẻ, dòng giỏ một hàng, backoffice menu ngang), F9 thanh toán ở bàn (D-074), khung món nhớ chỗ theo đơn (D-075). Cổng: unit 2.669 · `test:api` 1.665 · `test:sync` 20 · `test:browser` 153 · build — xanh. **Đang làm:** sổ tay sản phẩm `docs/handbook/` (2 agent, worktree `handbook-pos` / `handbook-bo`): máy quầy, quản lý, vận hành, ảnh minh họa, test chặn sót màn hình chưa có trang.

- 2026-10-21 12:50 — Chủ dự án thấy giao diện chưa đẹp bằng empos ⇒ (1) làn giao diện 2 (3 chặng nối tiếp, 1,15M token, 49 commit, merge `d374a10`): dựng lại giống empos bằng code của mình (D-071); (2) **ảnh món** trọn vẹn (1 agent, 0,45M token, merge `b0c93d6`, D-072, migration 0031): upload ở backoffice, thẻ món có ảnh trên POS, giữ ảnh khi mất mạng, quán mẫu 15 ảnh CC0. Cổng: unit ~2.630 · `test:api` 1.665 · `test:sync` 20 · `test:browser` 147 · build — xanh. Chờ chủ dự án: 3 thay đổi cấu trúc giao diện (menu ngang, thanh toán ngăn kéo 2 thẻ, dòng giỏ một hàng) + câu hỏi ảnh (backlog).

- 2026-10-21 05:15 — **Kết thúc đêm.** Báo cáo cho chủ dự án: `reports/progress-report-2026-10-21.md` (chờ duyệt §6). Đã merge + push `65c6b7f`: làn giao diện (4 chặng, 1,96M token, 104 commit — nền thiết kế, POS, backoffice, nhập/xuất menu Excel; ảnh trước/sau ở `~/FileMySelf/FNB-POS/ui-screenshots-2026-10-21/`), bàn × 2 máy (D-069, D-070), sửa lỗi gộp nhánh (sơ đồ bàn từ bootstrap thiếu `layout`). Cổng: unit 2.593 · `test:api` 1.653 · `test:sync` 20 · `test:browser` 130 · build — xanh. Đợt tiếp đề xuất: review vòng 4 (giao diện + khôi phục + bàn × 2 máy) và mã hàng SKU — CHỜ chủ dự án chọn.

- 2026-10-21 04:10 — Sửa "khôi phục backup làm máy quầy lệch" (1 agent, 0,37M token) đã merge `557c5ca`: thế hệ server (D-068, migration 0030), máy gửi lại lệnh server thiếu + kéo lại từ đầu, POS báo "máy chủ vừa được khôi phục". Cổng: unit 2.430 · `test:api` 1.653 · `test:sync` 20 · `test:browser` 94 · build — xanh. Làn UI đang ở chặng 4 (nhập Excel).

- 2026-10-21 03:25 — Vận hành cho quán thí điểm (1 agent, 0,43M token) đã merge `9071dae`: giới hạn tần suất (D-065), dọn mã ghép/phiên hết hạn (D-066, migration 0029), `pnpm ops:backup|ops:restore|ops:preflight|test:ops|build:server` + `infra/` hướng dẫn deploy 1 server Ubuntu (systemd + Caddy + Postgres 17, POS ở `/pos/`) + diễn tập khôi phục đo được (D-067). CI GitHub đỏ từ c86358c do 2 e2e đọc DB quá sớm ⇒ sửa `b856a1d` (luật test 36), CI xanh lại. Cổng sau merge: unit 2.401 · `test:api` 1.646 · `test:sync` 17 · `test:browser` 92 · build — xanh. **GẤP trước khi mở bán:** khôi phục backup làm máy quầy lệch server (backlog) ⇒ đang làm cơ chế "thế hệ server".

- 2026-10-21 02:30 — Review vòng 3 (đợt 8–9d, 0,50M token): 0 high, 2 medium (X2 tạm tính nhiều máy, X5 két đóng ca), 7 low, 7 test hở — `research/review-wave-8-9d-findings.md`. Đã sửa HẾT (1 agent, 0,62M token, 15 commit, merge `c233e48`): D-061 (két theo số server, approval chênh lệch mang số, thu/chi cộng chung ca), D-062 (máy nhanh ≤2′ dùng giờ máy), D-063 (hủy đơn đã in tạm tính/đã gửi bếp cần `close_unpaid_table`; tạm tính mang version), D-064 (khóa nhân viên × PIN, hoàn QR sau chốt, giờ theo ngày kinh doanh, log 500 có che bí mật, lệnh offline đẩy theo phiên người tạo). Cổng: unit 2.358 · `test:api` 1.624 · `test:sync` 17 · `test:browser` 92 — xanh. Làn UI (`feat/pos-and-backoffice-ui-refresh`) đang chạy, sẽ cần merge với các sửa này (đụng apps/pos/src/app/close-shift-flow, features/shift).

- 2026-10-21 00:30 — Đợt 9d (2 agent, 1,31M token, 80 phút) đã merge + push: POS duyệt tại chỗ bằng PIN quản lý, hủy món (phiếu hủy cho bếp), giảm dòng/đơn, hủy nháp, hoàn tiền từ lịch sử đơn, thu/chi két, đóng ca đếm theo mệnh giá, lịch sử đơn, đăng xuất nhân viên (D-057); server: HĐĐT timeout + lookup trước khi gửi lại (W9/T1/T2, D-058), "đã hoàn tiền QR cho khách" (D-059), công cụ nhân viên + lưu trữ vai trò, `save_draft.expectedVersion`, bootstrap mang đơn mở + sơ đồ bàn (D-060). Sau merge e2e backoffice đỏ lúc 00:05 ⇒ **lỗi thật**: trang "In lỗi" lọc theo ngày LỊCH trong khi ô ngày là ngày KINH DOANH ⇒ phiếu in lỗi 00:00–04:00 biến mất; sửa ở `shopDaysWindow` (cửa sổ 04:00→04:00). Cổng: unit 2.322 · `test:api` 1.595 · `test:sync` 16 · `test:browser` 92 — xanh.
- Chủ dự án gửi FE tham khảo (empos.vn, `~/Downloads/Telegram Desktop/goopos-fe`, CHỈ ĐỌC, không chép code/asset — repo này public) + mẫu nhập hàng `products-2026-06-13.xlsx` ⇒ làn làm lại UI (1 agent mỗi lúc, 4 chặng nối tiếp tới ~05:30) trên nhánh `feat/pos-and-backoffice-ui-refresh`; song song: review vòng 3 (chỉ đọc). Vận hành (T11) hoãn sang đợt sau vì RAM.

- 2026-10-20 22:45 — Chủ dự án bảo "tiếp tục, đừng dừng tới 6h sáng" (chưa trả lời từng mục §8 của báo cáo ⇒ các quyết định "chờ user" vẫn chờ, code chạy theo đề xuất). Đợt 9c (2 agent, 1,08M token, 65 phút) đã merge + push: **`pnpm dev:stack`** (Postgres nhúng bền trong `tmp/dev-stack/`, quán mẫu "Cà phê Mẫu" seed qua route/domain, in URL + tài khoản + PIN + mã ghép; `pnpm dev:bank-notice` giả webhook SePay) + entrypoint API thật (`pnpm api:start`, D-055) + `pnpm db:provision`; **giờ lệnh do server quyết** (D-054, migration 0024); **POS phục vụ tại bàn** (sơ đồ, mở bàn, nhiều lượt, gửi bếp phần mới, tạm tính, trả tại bàn, chuyển bàn — D-056). CI GitHub đã đỏ từ 01:44 vì máy CI chậm ⇒ sửa ở `bbe3d80` (turbo `--concurrency=1 --continue`, domain testTimeout 30s), xanh lại. Cổng sau merge: unit 2.169 · `test:api` 1.553 · `test:sync` 16 · `test:browser` 68 — xanh.
- Tiếp: 9d (POS duyệt tại chỗ, hủy/giảm/hoàn, thu chi két, đóng ca, lịch sử đơn; server W9/T1/T2, refundDue "đã hoàn", công cụ nhân viên, lỗ hổng đơn bàn — `save_draft` expectedVersion) → 10 (review vòng 3 + vận hành).

- 2026-10-20 15:30 — Đợt 9b đã merge + push (`a3ed16e`): POS nhận QR do ngân hàng xác nhận (sửa W10), người mua HĐĐT + in lại bill; backoffice cài đặt, báo cáo, chốt ngày, khớp chuyển khoản tay + `refundDue`, sơ đồ bàn dạng danh sách, sửa W12. Cổng: unit 2.083 · `test:api` 1.531 · `test:sync` 16 · e2e 59 — xanh.
- **DỪNG chờ chủ dự án duyệt** báo cáo `reports/progress-report-2026-10-20.md` (§8 quyết định, §9 kế hoạch). **Không chạy 9c** khi chưa có câu trả lời. Sau khi duyệt: ghi các quyết định đã chốt vào decision-log (đổi "chờ user" ⇒ đã chốt), rồi chạy 9c (điểm khởi động API + `pnpm dev:stack` có quán mẫu + luật chung createdAt; POS màn bàn) và dừng một lần để chủ dự án bấm thử.
- Còn mở từ review vòng 2: W9, T1, T2 (HĐĐT) ⇒ đợt 9d.

- 2026-10-20 14:30 — Cặp 8a đã merge (`ee20117`): route đọc backoffice, `/auth/me` kèm quyền, lỗi domain kèm ids, `/settings`. Đợt 9a (2 agent, 574k token) đã merge + push (`b004b19`): sửa W1 (tiền hoàn tính vào ca), W2 (hủy món không được nâng tỉ lệ giảm toàn đơn), W6 (command_id theo thiết bị, migration 0022), W11/T4 (version ảnh chụp ca tăng theo sổ quỹ; kịch bản sync-client thật), W13 (chốt ngày chặn khi còn nháp; đơn trả sau chốt được đánh dấu `paid_after_day_close` và loại khỏi báo cáo đã chốt), W3 (QR đã trả ⇒ chặn trả bằng cách khác/hủy đơn, tiền chưa dùng vào `refundDue`), W4 (hạn QR theo giờ server), W5 (duyệt neo giờ server: createdAt ∈ [cấp−2′, cấp+10′], trễ đồng bộ ≤ 2h), W7, W8 (mã QR giữ 7 ngày, migration 0023). Cổng: `test:api` 1.531 · `test:sync` 16 · e2e 46 — xanh.
- Tiếp: 9b (POS QR thật + người mua HĐĐT; backoffice W12 + cài đặt/báo cáo/chốt ngày/khớp tay/sơ đồ bàn) → 9c (POS màn bàn; HĐĐT W9/T1–T3 + luật chung createdAt) → 9d (POS hủy/giảm/hoàn/đóng ca có PIN duyệt).

- 2026-10-20 12:30 — **Dừng giữa đợt 8 vì hết hạn mức sử dụng.** Cặp 8a đã xong nhưng CHƯA merge: nhánh `feat/backoffice-read-routes-and-config-writes` (4 commit, đã push lên origin; worktree `~/FileMySelf/FNB-POS/worktrees/server-gaps`) có `GET /branches|/devices|/staff`, `/auth/me` kèm permissionKeys, lỗi domain kèm ids, một bộ chuyển ProductDocument → domain, `GET/PUT/DELETE /settings` (validateFlags trên mọi tầng). Agent báo verify/test:api xanh; chưa chạy lại test:browser sau task 3. **Việc đầu phiên sau:** merge main vào nhánh đó, chạy đủ 4 cổng theo luật 27 (tuần tự, ít worker), rồi fast-forward main + push.
- Review sâu đợt 3–7: `research/review-wave-3-7-findings.md` — đọc rồi chia việc sửa (đợt 9). Cặp 8b (POS màn bàn + QR tự xác nhận + người mua HĐĐT; backoffice cài đặt + báo cáo + chốt ngày + khớp tay) CHƯA chạy.

- 2026-10-20 11:55 — Đợt 7 cặp 2 (2 agent, 1,06M token, 74 phút) đã merge + push (`a601e37`): **backoffice web** (`apps/backoffice`, Next.js 15.5.28: đăng nhập + chọn tổ chức, chọn chi nhánh, thiết bị + mã ghép + thu hồi, nhân viên + PIN, vai trò + ngưỡng, danh mục, trình sửa món với xem trước lựa chọn của khách bằng domain, hết món) + e2e dựng menu trà sữa / ghép thiết bị / dữ liệu xấu; **hóa đơn điện tử** (hồ sơ theo chi nhánh, interface nhà cung cấp + bản giả, 1 hóa đơn mỗi lần thanh toán qua hàng đợi SKIP LOCKED + backoff, thông tin người mua, gửi cuối ngày), **chốt ngày** (chặn khi còn ca mở / hóa đơn chưa phát), **báo cáo doanh thu ngày** theo định nghĩa cố định.
- **Lỗ hổng tích hợp:** backoffice gọi `GET /branches`, `GET /devices?branchId=`, `GET /staff` mà API CHƯA có (e2e dùng bản giả lập trong `e2e/backoffice/support/pending-backoffice-read-routes.ts`) ⇒ bản thật báo lỗi ở chọn chi nhánh/danh sách thiết bị/nhân viên. Việc đầu của đợt 8.
- Cổng: unit ~1.700 · `test:api` 1.459 · `test:sync` 14 · `test:browser`/e2e 46 — xanh.
- Tiếp: đợt 8 — cặp 8a: review sâu đợt 3–7 (chỉ đọc) + route server còn thiếu (3 route đọc, `/auth/me` kèm quyền, route ghi cấu hình, gộp chuyển đổi tài liệu món); cặp 8b: POS màn bàn + QR tự xác nhận + người mua hóa đơn; backoffice cài đặt + báo cáo + chốt ngày + khớp tay.

---

## Phase 00 — Chốt yêu cầu & kiểm chứng ([phase](phase-00-chot-yeu-cau-va-kiem-chung-ky-thuat.md))

### T00-01 Hồ sơ quán thí điểm — `user`
- **Cần biết:** tên/loại quán; số quầy, số bàn, số khu; giờ mở/đóng (có qua nửa đêm?); số nhân viên + vai trò; nhân viên có order tại bàn không, bằng gì (⇒ kéo FT-105 vào R1?); thiết bị đang có (máy tính, tablet, máy POS, máy in bill/tem: hãng, model, LAN/USB/Bluetooth, két); phần mềm đang dùng; nhà cung cấp hóa đơn điện tử đang dùng; ngân hàng nhận chuyển khoản; có bán qua GrabFood/ShopeeFood không; menu hiện tại (ảnh/Excel).
- **Xong khi:** điền đủ vào `research/pilot-cafe-profile.md`.
- **Trạng thái:** user — chờ chủ dự án chọn quán thí điểm.

### T00-02 Dùng thử KiotViet FnB — `user` đăng ký → Claude làm
- **Làm:** Claude điều khiển Chrome đi qua: món + topping + combo, bàn, gửi bếp, chuyển/gộp/tách bàn, hủy món, thanh toán nhiều phương thức, ca, kiểm kê, định lượng, khuyến mãi, phân quyền, báo cáo.
- **Xong khi:** `research/research-g-dung-thu-kiotviet-fnb.md` có từng flow theo mẫu của file A; mục "khác với catalog" ghi rõ.
- **Trạng thái:** user — chờ tài khoản dùng thử KiotViet FnB.

### T00-03 Dùng thử CukCuk — `user` đăng ký → Claude làm
- Như T00-02, file `research/research-h-dung-thu-cukcuk.md`.
- **Trạng thái:** user — chờ tài khoản dùng thử CukCuk.

### T00-04 Phỏng vấn quán thí điểm — `user` (Claude soạn kịch bản)
- **Hỏi:** một ngày làm việc; giờ cao điểm; 10 thao tác dùng nhiều nhất; lỗi hay gặp ở phần mềm cũ; câu 7–11 [catalog §23](logic-catalog-flows-rules-and-design-decisions.md).
- **Xong khi:** câu trả lời ghi vào `research/pilot-cafe-profile.md`; decision-log cập nhật D-011, D-012.
- **Trạng thái:** user — chờ quán thí điểm (kịch bản phỏng vấn đã có ở catalog §23).

### T00-05 Hỏi kế toán thuế — `user`
- **Hỏi:** câu 12–15 catalog §23 + "mã hóa đơn từ máy tính tiền có sinh được trên máy khi offline không".
- **Xong khi:** trả lời ghi vào catalog §18 kèm tên người trả lời + ngày.
- **Trạng thái:** user — chờ kế toán trả lời.

### T00-06 Tạo repo + khung monorepo — Claude
- **Làm:** `git init` ở nơi user chốt; pnpm workspace + Turborepo; `apps/` `packages/` rỗng theo [bản đồ code](code-structure-and-conventions.md); `tsconfig.base.json`, eslint, prettier, vitest workspace; CI chạy `pnpm verify`; đăng ký repo vào `repos/registry.json` + `sources/<key>.md`.
- **Test:** `packages/domain/src/smoke.test.ts` (một test giả để chứng minh pipeline đỏ được khi sai).
- **Xong khi:** CI xanh trên commit đầu; cố tình làm hỏng test thì CI đỏ.
- **Phụ thuộc:** user chốt path + remote.
- **Trạng thái:** done (2026-10-20) — local verify xanh, hỏng có chủ đích thì đỏ; CI GitHub chạy khi push lần đầu. Đã đăng ký `fnb-pos` vào `repos/registry.json` + `sources/fnb-pos.md` của kho kiến thức.

### T00-07 Spike S2: DB cục bộ + đồng bộ — Claude
- **Làm:** `spikes/local-db-sync/`: interface repository chung cho SQLite (Node để test, Tauri, Capacitor) + SQLite WASM/OPFS (trình duyệt); outbox lệnh + server giả (Fastify + Postgres) áp idempotent; kéo theo cursor.
- **Test:** 2.000 đơn offline; rút/cắm mạng 20 lần; gửi trùng; đến sai thứ tự; chạy tiếp trên dữ liệu lần trước.
- **Xong khi:** báo cáo số đo: không mất/trùng đơn; thời gian ghi 1 đơn; dung lượng; kết quả trên Safari iOS (nếu có máy) ⇒ khóa D-008.
- **Phụ thuộc:** T00-06.
- **Trạng thái:** done (2026-10-20) — 0 mất / 0 trùng với 2.000 đơn offline + 500 đơn chạy tiếp trên dữ liệu cũ có lỗi mạng; ghi 1 đơn node:sqlite ~1,2–1,6 ms (synchronous=FULL); SQLite WASM/OPFS chạy được trong Chrome headless (opfs-sahpool chỉ 1 tab). Lộ bẫy 12 (xem Backlog). D-008 giữ, có điều chỉnh (D-021).

### T00-08 Spike S1: in ấn — Claude + `user` cắm máy in
- **Làm:** `spikes/printing/`: mã hóa ESC/POS (tiếng Việt có dấu: thử code page và chế độ ảnh raster) + TSPL (tem); gửi qua TCP 9100 từ Tauri và Capacitor; Bluetooth trên Android; Sunmi nếu có; mở két.
- **Xong khi:** in đúng trên ≥ 2 máy in thật của quán; đo thời gian bấm → ra giấy; ghi model nào chạy được.
- **Phụ thuộc:** T00-01 (biết model), T00-06.
- **Trạng thái:** blocked (cần máy in thật + vỏ Windows/Android) — mã hóa ESC/POS tiếng Việt + xem trước giấy đã có ở `packages/printing` (T04-11).

### T00-09 Spike S3: VietQR + webhook — Claude, `user` mở sandbox SePay hoặc PayOS
- **Làm:** sinh payload EMVCo + CRC; nhận webhook sandbox; khớp theo mã nội dung; ca thiếu/thừa/sai/trùng.
- **Xong khi:** chọn được cổng (SePay/PayOS) + biết cách kiểm chữ ký.
- **Trạng thái:** done phần Claude (2026-10-20) — VietQR EMVCo + webhook SePay kiểm chữ ký + khớp mã nội dung (T05-01…03), `pnpm dev:bank-notice` giả thông báo ngân hàng; thử sandbox thật chờ tài khoản.

### T00-10 Spike S4: hóa đơn điện tử — Claude, `user` mở sandbox nhà cung cấp
- **Xong khi:** biết chắc luồng phát hành, mã, gửi cuối ngày, hoàn tiền, hành vi khi offline của nhà cung cấp đã chọn.
- **Trạng thái:** blocked (chờ sandbox nhà cung cấp HĐĐT) — interface + bản giả ở T05-06.

### T00-11 Chốt phạm vi R1 — Claude + `user`
- **Làm:** cập nhật catalog, kiến trúc, decision-log, feature-map theo T00-01…10; khóa các [SPIKE].
- **Xong khi:** user duyệt phạm vi R1 cuối cùng.

---

## Phase 01 — Nền móng ([phase](phase-01-nen-mong-tenant-xac-thuc-quyen-thiet-bi.md))
- **Trạng thái:** user — chờ T00-01…10.

### T01-01 Tooling monorepo
- **Làm:** turbo pipeline `verify/test:unit/test:api/test:sync/e2e/build`; eslint 0 warning; path alias; script `pnpm verify`.
- **Xong khi:** mọi lệnh gate chạy được (kể cả khi chưa có test) và trả exit code đúng.
- **Trạng thái:** một phần (2026-10-20) — đã có `test:api` (turbo, cache: false) + bước CI; `test:sync`/`e2e`/`build` thêm khi có code tương ứng.

### T01-02 Postgres + migration + helper test
- **Làm:** docker compose Postgres 16; drizzle-kit; helper tạo DB test riêng mỗi lần chạy, dọn sau.
- **Test:** `apps/api/test/integration/infra/migrations-apply-cleanly.test.ts`.
- **Trạng thái:** done (2026-10-20) — migration SQL viết tay + runner (khóa advisory, checksum, 1 transaction/file), Postgres 17.10 nhúng (cổng động, thư mục tạm), role `fnb_owner` (migration) / `fnb_app` (DML). Không dùng Docker (máy không có quyền).

### T01-03 Tenancy + RLS
- **Làm:** `organization, brand, branch, area, table(khung), device, user`; RLS mọi bảng; `SET app.tenant_id` mỗi request.
- **Test:** `apps/api/test/integration/tenancy/rls-blocks-cross-tenant-reads.test.ts` — tenant A không đọc/ghi được của B (đọc, sửa, xóa, liệt kê); tắt RLS thì test đỏ.
- **Trạng thái:** done (2026-10-20) — 7 bảng tenancy, ENABLE + FORCE RLS, policy `NULLIF(current_setting('app.tenant_id', true), '')::uuid`, UNIQUE (tenant_id, id) + khóa ngoại kép (tenant_id, parent_id) vì kiểm FK bỏ qua RLS; test âm chéo tenant + test owner bị RLS ràng buộc. `withTenant` + Fastify `buildApp` + `/health`.

### T01-04 Đăng nhập backoffice
- **Làm:** SĐT/email + mật khẩu; OTP (nhà cung cấp SMS/email để sau, giao diện adapter); phiên; quên mật khẩu.
- **Test:** `apps/api/test/integration/auth/backoffice-login.test.ts` — sai mật khẩu, khóa sau N lần, phiên hết hạn.
- **Trạng thái:** done (2026-10-20) — bảng toàn cục `fnb_auth.account/account_tenant/session` (fnb_app chỉ gọi hàm SECURITY DEFINER), membership theo tenant; khóa 15 phút sau 5 lần sai, 401 giống nhau cho mọi lỗi + scrypt giả để không lộ thời gian; phiên 7 ngày tuyệt đối; account nhiều tổ chức ⇒ 409 kèm danh sách. OTP: chỉ cổng + fake. Quên mật khẩu chưa làm.

### T01-05 Ghép / thu hồi thiết bị
- **Làm:** mã ghép một lần (hạn 10 phút) → token thiết bị; thu hồi.
- **Test:** `apps/api/test/integration/devices/{pairing-code-single-use,revoked-device-is-rejected}.test.ts`.
- **Trạng thái:** done (2026-10-20) — mã ghép 8 ký tự (bảng 30 ký tự không nhầm), 10 phút, dùng một lần; token thiết bị `<tenantId>.<secret>` chỉ lưu SHA-256; thu hồi idempotent; `GET /devices/me`.

### T01-06 PIN nhân viên
- **Làm:** PIN trên thiết bị đã ghép; giới hạn thử + khóa tạm; bản băm có salt cho offline lưu ở kho bảo mật của vỏ.
- **Test:** `apps/api/test/integration/auth/staff-pin-lockout.test.ts`.
- **Trạng thái:** done phía server (2026-10-20) — PIN 4–6 số, chặn PIN dễ; sai 5 lần khóa 5 phút (429 + Retry-After); staff session 12h gắn thiết bị; sai chi nhánh 403. Xác minh PIN offline CHƯA làm (Backlog).

### T01-07 Khóa quyền + vai trò mẫu + `authorize()`
- **Làm:** danh mục khóa quyền catalog §16; ngưỡng (vd giảm > X%); vai trò mẫu; `authorize(action, ctx) → allowed | needs_approval | denied` (thuần, trong domain).
- **Test:** `packages/domain/src/permissions/authorize.test.ts` — mỗi khóa quyền: có quyền / không quyền / vượt ngưỡng.
- **Trạng thái:** done (2026-10-20) — `permissions/`: 19 khóa quyền, ngưỡng (giảm giá %, thu/chi tiền), approvable; nhiều grant ⇒ lấy rộng nhất; `canApprove` yêu cầu khóa approvable; 6 vai trò mẫu (chờ user duyệt con số).

### T01-08 Duyệt tại chỗ + nhật ký
- **Làm:** lệnh mang `approval{approver_staff_id, pin_proof}`; `approval_log`; `audit_log` chỉ thêm, không sửa.
- **Test:** `apps/api/test/integration/auth/manager-approval-is-logged.test.ts` — duyệt sai PIN bị từ chối; duyệt đúng ghi đủ người yêu cầu/người duyệt.
- **Trạng thái:** done (2026-10-20) — `approval_log`, `audit_log` chỉ-thêm (REVOKE + trigger chặn cả owner), approver ≠ requester, `recordApproval`/`appendAudit` lấy tenant từ phiên DB.

### T01-09 Cấu hình kế thừa + công tắc
- **Làm:** `config_value(scope, key, value)`, resolve hệ thống → thương hiệu → chi nhánh → thiết bị; `packages/feature-flags` khai `requires/excludes`.
- **Test:** `packages/feature-flags/src/{validate-flag-constraints,resolve-inherited-config}.test.ts`.
- **Trạng thái:** done (2026-10-20) — `packages/feature-flags` (12 công tắc, requires/excludes, scope), `resolveConfig`, bảng `config_value` có cột sinh brand/branch/device + khóa ngoại kép.

### T01-10 Backoffice khung
- **Làm:** Next.js: đăng nhập, chi nhánh, nhân viên, vai trò, thiết bị (ghép/thu hồi), cấu hình.
- **Test:** `e2e/backoffice/pair-a-device.spec.ts`.
- **Trạng thái:** done (2026-10-20) — `apps/backoffice` Next.js 15.5: đăng nhập, chọn tổ chức/chi nhánh, thiết bị, nhân viên, vai trò. **Thiếu route đọc phía API** (Backlog).

---

## Phase 02 — Lõi nghiệp vụ ([phase](phase-02-loi-nghiep-vu-dung-chung-gia-thue-don.md))

> Mọi task ở đây: test viết **trước**, nằm cạnh file nguồn trong `packages/domain/src/<miền>/`.

### T02-01 Kiểu tiền / số lượng / tỉ lệ
- **Test:** `money/money.test.ts` — cộng/nhân/chia làm tròn rõ ràng; từ chối float; định dạng `45.000 ₫`.
- **Trạng thái:** done (2026-10-20) — `money/{money,quantity,rate,divide-rounded}.ts` + 54 test (gồm property test); đổi `>=` thành `>` trong half-up làm 6 test đỏ.

### T02-02 `resolvePrice`
- **Luật:** ưu tiên variant > product > category > global; lọc chi nhánh, kênh, ngày, giờ, thứ; giá nhập tay; theo cân (đơn giá × số lượng 3 lẻ).
- **Test:** `pricing/resolve-price.test.ts` — mỗi tầng ưu tiên; happy hour bật đúng phút; ngoài khung giờ thì về giá thường.
- **Trạng thái:** done (2026-10-20) — `pricing/resolve-price.ts` + `validatePriceListItem`; ưu tiên variant > product > category > global, rồi branch > null, channel > null, priority, id. Có 3 câu hỏi chờ user (D-022).

### T02-03 `validateModifierSelection`
- **Luật:** min/max/bắt buộc; điều kiện theo biến thể; chọn trùng; max theo tùy chọn.
- **Test:** `catalog/validate-modifier-selection.test.ts` — mỗi luật một ca qua + một ca bị chặn với mã lỗi.
- **Trạng thái:** done (2026-10-20) — `catalog/validate-modifier-group-config.ts`, `validate-modifier-selection.ts`; bắt buộc ⇔ minSelect ≥ 1; fixture trà sữa trân châu.

### T02-04 `resolveCombo`
- **Test:** `catalog/resolve-combo.test.ts` — đổi món có phụ thu; thiếu slot bắt buộc bị chặn.
- **Trạng thái:** done (2026-10-20) — `catalog/resolve-combo.ts`.

### T02-05 Cây dòng đơn + `computeOrderTotals`
- **Luật:** dòng `item | modifier | combo_component | discount`; VAT + phí dịch vụ theo kênh; phí trước/sau khuyến mãi; giá gồm/cộng thuế.
- **Test:** `totals/compute-order-totals.test.ts` — bảng ví dụ thật của quán (sau T00-05).
- **Trạng thái:** done (2026-10-20) — gồm cả dòng hủy (gộp vào dòng gốc) và đơn hoàn (đối xứng / đọc `refundAmounts`).

### T02-06 Làm tròn
- **Test:** `totals/rounding.test.ts` — chỉ tiền mặt vs toàn đơn; từng phương pháp.
- **Trạng thái:** done (2026-10-20) — `rounding/cash-rounding.ts` (`roundToStep`, `cashRoundingAdjustment`).

### T02-07 Giảm toàn đơn + phân bổ
- **Luật:** tách một dòng âm mỗi thuế suất; phân bổ theo tỉ lệ, dư đồng lẻ dồn dòng lớn nhất.
- **Test:** `totals/allocate-discount.test.ts`, `totals/order-totals.property.test.ts` (Σ dòng = tổng; Σ phân bổ = tổng giảm; không phụ thuộc thứ tự thêm món).
- **Trạng thái:** done (2026-10-20) — `buildOrderDiscountLines` (một dòng mỗi thuế suất), `allocateAmount` (largest remainder).

### T02-08 Máy trạng thái đơn + mã lỗi
- **Test:** `order/order-state-machine.test.ts` — mọi chuyển hợp lệ; mọi chuyển cấm trả đúng mã (`DOMAIN_ORDER_ALREADY_PAID`…).
- **Trạng thái:** done (2026-10-20) — `order/` (types, line tree, state machine). Dòng con: quantity tính trên MỘT đơn vị dòng cha (D-020). Dòng âm (hủy/hoàn) chưa có — thêm ở T02-09.

### T02-09 `voidLine` + `buildRefund`
- **Luật:** chưa gửi ⇒ sửa; đã gửi ⇒ dòng âm có lý do; đã trả ⇒ đơn hoàn dòng âm, số lượng còn hoàn tính cả đơn hoàn chưa trả, cờ `restock`.
- **Test:** `order/void-line.test.ts`, `order/build-refund.test.ts` — hoàn 2 lần không vượt gốc.
- **Trạng thái:** done (2026-10-20) — `voidLine` + `buildRefund` (ở `totals`, cần charge profile của lúc bán) trả đúng phần giảm/thuế/phí đã trả; lần hoàn cuối nhận phần dư.

### T02-10 `businessDate`
- **Test:** `time/business-date.test.ts` — 03:59 thuộc hôm trước với giờ cắt 4h; đổi giờ cắt theo chi nhánh; múi giờ.
- **Trạng thái:** done (2026-10-20) — `time/business-date.ts`. Sau merge phát hiện property test đỏ ngẫu nhiên: `fc.date` của fast-check 4 sinh ngày không hợp lệ ⇒ đã thêm `noInvalidDate: true` (luật mới trong testing-strategy).

### T02-11 Bộ property test + `domain_version`
- **Xong khi:** 10.000 đơn ngẫu nhiên: tổng tính 2 lần (mô phỏng client/server) trùng từng đồng; độ phủ domain ≥ 95%.
- **Trạng thái:** done (2026-10-20) — `totals/order-lifecycle.property.test.ts` 10.000 vòng đời (bán → giảm → hủy → trả → hoàn nhiều lần), server dựng lại đơn hoàn từ cùng yêu cầu qua JSON round-trip cho kết quả giống hệt. Bộ unit domain giờ ~10s.

---

## Phase 03 — Menu & cấu hình ([phase](phase-03-menu-cau-hinh-quan-va-mau-loai-quan.md))

### T03-01 Schema catalog + migration
- **Test:** `apps/api/test/integration/catalog/catalog-schema-constraints.test.ts` — không xóa cứng món đã bán.
- **Trạng thái:** done (2026-10-20) — 0007_catalog.sql, 0008_price_lists.sql; fnb_app không DELETE được món/biến thể/option (chỉ archived_at); CHECK ở DB cho luật rẻ.

### T03-02 API catalog
- **Làm:** CRUD; kiểm bằng `validateModifierSelection`; đẩy `change_seq`.
- **Test:** `apps/api/test/integration/catalog/catalog-crud.test.ts` — cấu hình sai (min > max) bị chặn kèm lý do.
- **Trạng thái:** done (2026-10-20) — PUT/GET món dạng tài liệu lồng nhau, khóa lạc quan theo version (409), danh mục, trạm, hết món tay, bảng giá; lỗi domain ⇒ 400 `{code}`. **Chưa gắn `edit_menu`** (đợt 4).

### T03-03 UI danh mục / món / biến thể
- **Trạng thái:** done (2026-10-20) — danh mục + danh sách món + trình sửa món (backoffice).

### T03-04 UI nhóm tùy chọn + điều kiện + xem trước lựa chọn của khách
- **Trạng thái:** done (2026-10-20) — nhóm tùy chọn, luật theo size, xem trước lựa chọn bằng domain.

### T03-05 UI combo
- **Test chung T03-03…05:** `e2e/backoffice/build-milk-tea-menu.spec.ts` — dựng 1 món trà sữa đủ size/đường/đá/topping, xem trước, lưu, mở lại đúng.
- **Trạng thái:** done (2026-10-28) — trang quản lý tạo/sửa combo (phần, giới hạn, món theo size, phụ thu, xem trước bằng domain; lỗi ở đúng dòng/phần — D-116); `order.save_draft` mang `comboPicks`, máy chủ tính lại bằng `resolveComboPicks`, lưu cây combo → món → tùy chọn, từ chối món ngoài phần, quá số, hết món, ngừng bán (D-113); máy quầy bán combo bằng màn chọn phần + tùy chọn riêng của từng món, phiếu bếp chia theo trạm của từng món, bill/tem ly có món trong combo (D-114); hủy/hoàn theo nguyên combo (D-115). Test: `packages/domain/src/catalog/resolve-combo-picks.test.ts`, `packages/domain/src/kitchen/diff-kitchen-ticket-combo.test.ts`, `apps/api/test/integration/sync/sync-save-draft-sells-combos.test.ts`, `apps/api/src/sync/draft-line-locks-combo.test.ts`, `apps/pos/src/screens/sale/combo-picker-screen.test.tsx`, `apps/pos/src/features/order/combo-cart-line.test.ts`, `apps/backoffice/src/components/menu/product-editor/product-editor-combo.test.tsx`. Chưa có e2e trình duyệt cho combo (Backlog).

### T03-06 Bảng giá
- **Test:** `e2e/backoffice/happy-hour-price-list.spec.ts`.
- **Trạng thái:** done (2026-10-29) — schema + API bảng giá (`price-list-routes.ts`: thêm danh sách và xóa, `price-list-roundtrip.test.ts`, `price-list-list-and-delete.test.ts`), máy quầy áp giá theo bảng (`apps/pos/src/features/menu/menu-prices.ts`), trang Thực đơn → Bảng giá (danh sách, sửa quy tắc phạm vi / giảm % hoặc giá cố định / chi nhánh / kênh / ngày / giờ, lỗi đặt đúng ô — D-117; `e2e/backoffice/happy-hour-price-list.spec.ts`). Chưa có kênh bán thật, nhóm khách, số lượng tối thiểu (Backlog).

### T03-07 Trạm pha chế/bếp + gán món
- **Test:** `e2e/backoffice/manage-stations.spec.ts`.
- **Trạng thái:** done (2026-10-29) — API trạm (`category-and-station-routes.ts`), gán món → trạm trong trình sửa món, phiếu theo trạm (T04-10), trang Thực đơn → Trạm pha chế (thêm, đổi tên, xóa trạm không còn món gán và chưa in phiếu; D-118). Chưa có lưu trữ trạm và chưa gán trạm theo chi nhánh cho món (Backlog).

### T03-08 Hết món bật tay
- **Test:** `apps/api/test/integration/catalog/manual-86-hides-item-on-pos.test.ts`.
- **Trạng thái:** done (2026-10-20) — `PUT /catalog/availability`; màn "Hết món" ở trang quản lý (`apps/backoffice/src/components/menu/availability-screen.tsx`).

### T03-09 Ảnh món
- **Test:** `apps/api/test/integration/catalog/image-upload-validates-type-and-size.test.ts`.
- **Trạng thái:** done (2026-10-21, `b0c93d6`) — D-072, migration 0031: upload ở trang quản lý, thẻ món có ảnh trên máy quầy, giữ ảnh khi mất mạng (`e2e/backoffice/attach-product-photo.spec.ts`, `e2e/pos/product-photo-on-the-till.spec.ts`).

### T03-10 Mẫu loại quán
- **Test:** `packages/shop-templates/src/apply-template-is-idempotent.test.ts` — chạy 2 lần không nhân đôi.
- **Trạng thái:** done (2026-10-29) — `packages/shop-templates` (5 mẫu: cà phê, trà sữa, quán ăn, quán bar, tiệm bánh; danh mục + trạm + công tắc; `planTemplate` / `applyTemplate` chỉ thêm cái còn thiếu, kiểm bằng property test), `GET /shop-templates`, `GET /shop-templates/:id/plan`, `POST /shop-templates/:id/apply` (cần Sửa menu + Cài đặt cửa hàng), trang Cửa hàng → Mẫu loại quán có xem trước trước khi áp (D-119; `e2e/backoffice/apply-shop-template.spec.ts`). Không có chỗ chứa trong R1 nên bỏ: nhóm tùy chọn mẫu, bán thành phẩm theo mẻ, quy đổi chai → ml, lô + hạn dùng, giờ cắt ngày kinh doanh, công tắc giao hàng.

### T03-11 Nhập/xuất Excel
- **Test:** `apps/api/test/integration/catalog/menu-excel-roundtrip.test.ts`.
- **Trạng thái:** done (2026-10-21) — nhập menu từ Excel + tải bảng menu (`e2e/backoffice/import-menu-from-excel.spec.ts`, `download-menu-sheet.ts`).

### T03-12 Dữ liệu xấu ở backoffice
- **Test:** `e2e/backoffice/hostile-menu-data.spec.ts` — 360px/800px, không tràn ở phần tử đang cuộn.

---

## Phase 04 — Bán tại quầy ([phase](phase-04-ban-tai-quay-offline-dong-bo-in-an-ca-ket.md))
- **Trạng thái:** done (2026-10-21) — `e2e/backoffice/hostile-menu-data-layout.spec.ts`, `hostile-operations-pages-layout.spec.ts`.

### T04-01 Schema đơn / thanh toán / ca / in / hủy (server + SQLite)
- **Test:** `apps/api/test/integration/order/paid-order-is-immutable.test.ts`.
- **Trạng thái:** một phần (2026-10-20) — 0011_orders.sql: sales_order (charge_profile snapshot), sales_order_line, refund_line_amount, payment, line_void_record, shift (khung); trigger chặn sửa dòng của đơn không ở draft (kể cả owner). Chưa có print_job, kitchen_ticket.

### T04-02 Sync: kéo bản chụp + thay đổi theo cursor
- **Test:** `packages/sync-client/test/scenarios/pull-resumes-from-cursor.test.ts`.
- **Trạng thái:** done (2026-10-20) — `@fnb/sync-client`: kéo theo cursor (lưu cùng giao dịch, lùi ⇒ lỗi), giữ snapshot server version cao nhất, không lùi.

### T04-03 Sync: outbox lệnh + endpoint server
- **Test:** `packages/sync-client/test/scenarios/{duplicate-command-is-noop,out-of-order-commands,domain-version-mismatch-is-rejected,server-recomputes-totals}.test.ts`.
- **Trạng thái:** done (2026-10-20) — client + server; kịch bản test:sync: pull-resumes-from-cursor, duplicate, out-of-order, domain-version, server-recomputes-totals, offline-sale-then-sync (2.000 đơn), continue-on-previous-state, two-tills-at-peak-converge.

### T04-04 Màn "cần xử lý"
- **Test:** `apps/pos/src/features/sync/rejected-commands-panel.test.tsx`.
- **Trạng thái:** xong (2026-10-30, D-137, commit ở "Bàn giao phiên trước") — mỗi lệnh bị từ chối có nút hợp loại lệnh: làm lại trên bản mới của đơn, mở đơn / bàn (kể cả "xin duyệt rồi gửi lại"), đóng đơn bằng QR đã nhận, bỏ qua có lý do (audit; lệnh tiền / phiếu bếp phải có lời ghi); xử lý xong thì rơi khỏi danh sách và nhớ bền. Test: `apps/pos/src/screens/needs-attention/needs-attention-screen.test.tsx`, `apps/pos/src/features/sync/{redo-refused-draft,rejection-routes}.test.ts`, `apps/pos/src/app/settled-qr-needs-attention.test.tsx`, `apps/api/test/integration/sync/dismissing-a-refused-command-is-audited.test.ts`.

### T04-05 POS: ghép máy, đăng nhập PIN, đổi người
- **Test:** `e2e/pos/pair-and-pin-login.spec.ts`.
- **Trạng thái:** done bản web (2026-10-20) — ghép máy bằng mã 8 ký tự, chọn nhân viên + PIN, token thiết bị trong IndexedDB (vỏ native phải dùng keychain); e2e `e2e/pos/pair-and-pin-login.spec.ts`. Đổi người chưa gọi logout server (chưa có endpoint).

### T04-06 Màn bán
- **Làm:** lưới món, tìm nhanh, chọn biến thể/tùy chọn, ghi chú, số lượng, giữ đơn, nhiều đơn song song.
- **Test:** `apps/pos/src/features/order/modifier-picker.test.tsx`; `e2e/pos/counter-sale-cash.spec.ts`.
- **Trạng thái:** done bản web (2026-10-20) — tab danh mục, tìm bỏ dấu, lưới món, bảng chọn tùy chọn theo luật domain, giỏ dạng cây, lưu nháp tự động. Chưa có: combo, ảnh món, mở lại nháp sau khi tải lại: xong 2026-10-30, D-135 (giá mở + món cân: xong ở T04-07, 2026-10-28).

### T04-07 Tổng tiền + giảm tay + giá nhập tay + theo cân
- **Test:** `e2e/pos/manual-discount-over-threshold-needs-approval.spec.ts`.
- **Trạng thái:** done (2026-10-28, nhánh `feat/open-price-and-weighed-items`) — giảm dòng/đơn + duyệt vượt ngưỡng (D-057, `e2e/pos/void-discount-refund-with-approval.spec.ts`); **giá nhập tay** (ngăn nhập giá, duyệt gắn đơn + dòng + đúng giá, D-105) và **món theo cân** (kg / 100 g, nhập gam, D-106, D-107) bán được ở quầy và bàn; test `apps/pos/src/app/counter-typed-price-and-weight.test.tsx`, `apps/api/test/integration/sync/sync-save-draft-{open-price-needs-the-permission,prices-weighed-lines-by-weight}.test.ts`. Còn: hủy món cân đã gửi bếp, cân điện tử (backlog).

### T04-08 Thanh toán
- **Làm:** tiền mặt (gợi ý mệnh giá, tiền thừa), QR động (xác nhận tay), thẻ (ghi nhận tay), nhiều phương thức.
- **Test:** `e2e/pos/split-tender-cash-and-qr.spec.ts`.
- **Trạng thái:** done bản web (2026-10-20) — tiền mặt (phím nhanh, tiền thừa), QR xác nhận tay, nhiều phương thức; e2e `counter-sale-cash.spec.ts`. Chưa làm tròn tiền mặt.

### T04-09 Số đơn 3 lớp + số gọi món
- **Test:** `packages/domain/src/order/order-numbering.test.ts`; `packages/sync-client/test/scenarios/offline-orders-get-unique-numbers.test.ts`.
- **Trạng thái:** một phần (2026-10-20) — số đơn theo máy + số gọi tạm tính trên máy (D-048); số gọi khi chi nhánh có ≥ 2 máy (D-082) chưa.

### T04-10 Phiếu pha chế theo trạm
- **Làm:** domain `diffKitchenTicket(order, sent)` → dòng mới/sửa ghi chú/hủy theo trạm; bảng `kitchen_ticket(_line)`.
- **Test:** `packages/domain/src/kitchen/kitchen-ticket-diff.test.ts` — gửi lượt 2 chỉ in món mới; hủy in phiếu hủy đúng trạm.
- **Trạng thái:** done phía server (2026-10-20) — `order.mark_sent_to_kitchen`, kitchen_ticket(_line) chỉ-thêm, sent_quantity/sent_note; UI POS + in thật chưa.

### T04-11 `packages/printing`
- **Làm:** mẫu bill, tem ly (1 tem/ly, có topping), phiếu pha chế, chốt ca → ESC/POS + TSPL; xem trước dạng chữ.
- **Test:** `packages/printing/src/templates/*.test.ts` so với `__golden__/`.
- **Trạng thái:** done (2026-10-20) — `@fnb/printing`: ESC/POS + TSPL + Windows-1258 + ascii-fold, QR, mẫu bill/tem ly/phiếu bếp/chốt ca, golden (`pnpm --filter @fnb/printing golden:update`). Chưa thử máy in thật (T00-08).

### T04-12 Vỏ Tauri (Windows)
- **Trạng thái:** blocked — cần máy Windows + máy in thật để thử (T00-08).

### T04-13 Vỏ Capacitor (Android/iOS)
- **Test chung:** `e2e/hardware-checklist.md` — chạy tay trên máy in của quán, ghi kết quả + ngày.
- **Trạng thái:** blocked — cần thiết bị Android/iOS + máy in thật.

### T04-14 Backoffice: máy in + gán trạm → máy in
- **Test:** `e2e/backoffice/assign-station-printer.spec.ts`.
- **Trạng thái:** todo — dời tới lúc có vỏ Windows + máy in thật (2026-10-29): chưa có bảng máy in, chưa có route, máy quầy in theo một cấu hình cố định (`apps/pos/src/features/printing/printer-profiles.ts`); làm trước khi có máy thật thì phải đoán cấu hình (khổ giấy, trang mã, cách nối) và dễ làm lại.

### T04-15 Hàng đợi in + in lại + báo lỗi
- **Test:** `apps/pos/src/features/printing/print-queue-retries-and-surfaces-failures.test.ts` — máy in tắt: job `failed`, hiện cảnh báo, bật lại in được, không mất phiếu.
- **Trạng thái:** một phần (2026-10-20) — `print.job_reported`, print_job_log chỉ-thêm, `GET /reports/print-failures`; hàng đợi in phía máy chưa.

### T04-16 Ca & két
- **Test:** `packages/domain/src/shift/expected-cash.test.ts`; `apps/api/test/integration/shift/{close-with-difference-needs-approval,open-orders-carry-to-next-shift,late-offline-order-keeps-its-shift}.test.ts`.
- **Trạng thái:** done phía server (2026-10-20) — domain `shift/` (trạng thái, mệnh giá, expectedCash, cumulativeCashMovedBy) + 0014 + lệnh shift.*; UI chưa.

### T04-17 Hủy dòng / void có duyệt / đơn hoàn (UI + API)
- **Test:** `e2e/pos/void-after-sent-needs-approval.spec.ts`; `apps/api/test/integration/order/refund-cannot-exceed-original.test.ts`.
- **Trạng thái:** done phía server (2026-10-20) — `order.void_line`, `order.refund`, `order.cancel`; duyệt tại chỗ dùng một lần (`approval_use`), hạn 10 phút quanh createdAt của máy. UI chưa.

### T04-18 Offline mode + kiểm thử
- **Làm:** phát hiện mất mạng; khóa thao tác (catalog §20); badge "chưa đồng bộ N".
- **Test:** `packages/sync-client/test/scenarios/{offline-sale-then-sync,continue-on-previous-state}.test.ts`; `e2e/pos/offline-counter-sale.spec.ts`; `e2e/pos/hostile-order-data.spec.ts`.
- **Trạng thái:** một phần (2026-10-20) — e2e `offline-counter-sale.spec.ts` (chặn /api ⇒ bán + trả ⇒ mở mạng ⇒ đồng bộ đủ).

---

## Phase 04b — Bàn cơ bản ([phase](phase-04b-ban-co-ban-cho-cafe-quay-va-ban.md))

### T4B-01 Schema + backoffice sơ đồ bàn
- **Test:** `e2e/backoffice/edit-floor-plan.spec.ts`.
- **Trạng thái:** done phía API (2026-10-20) — `/floor/areas`, `/floor/tables` (x/y/w/h/shape, số ghế, archive khi đã dùng); UI backoffice chưa.

### T4B-02 POS: màn sơ đồ bàn (trạng thái, thời gian ngồi)
- **Trạng thái:** done (2026-10-20) — D-056, sơ đồ từ bootstrap + feed (D-070), giao diện mới 2026-10-28; `e2e/pos/table-service.spec.ts`.

### T4B-03 Mở bàn, nhiều lượt, gửi pha chế
- **Trạng thái:** done phía server (2026-10-20) — `order.save_draft` nhận tableId (dine_in), đơn giữ bàn suốt đời, đổi bàn chỉ qua transfer.

### T4B-04 Tạm tính, in lại
- **Trạng thái:** done (2026-10-20) — D-056, tạm tính mang version (D-063); `e2e/pos/table-service.spec.ts`.

### T4B-05 Trả sau tại bàn, đóng bàn
- **Test chung T4B-02…05:** `e2e/pos/table-two-rounds-pay-later.spec.ts` — lượt 2 chỉ in món mới; tạm tính = thanh toán.
- **Trạng thái:** done (2026-10-20) — D-056, F9 thanh toán ở bàn (D-074); `e2e/pos/table-service.spec.ts`.

### T4B-06 Chuyển sang bàn trống
- **Test:** `packages/domain/src/table/transfer-to-empty-table.test.ts` — chuyển sang bàn có khách bị chặn (gộp để R2).
- **Trạng thái:** done phía server (2026-10-20) — `table.transfer` sang bàn trống (quyền transfer_table).

### T4B-07 Đơn quầy kèm số bàn
- **Test:** `e2e/pos/counter-order-with-table-tag.spec.ts`.
- **Trạng thái:** done phía server (2026-10-20) — `tableTag` cho đơn quầy (không chiếm bàn).

### T4B-08 Một đơn mở/bàn + khóa phiên bản + báo xung đột
- **Test:** `packages/sync-client/test/scenarios/two-devices-edit-same-table.test.ts` — máy lưu sau bị báo, không đè.
- **Trạng thái:** done phía server (2026-10-20) — unique partial index một đơn draft mỗi bàn; 2 máy mở cùng bàn đồng thời: một được, một bị từ chối.

### T4B-09 Offline với bàn
- **Luật:** máy mở bàn khi offline giữ bàn đó; máy khác chỉ xem tới khi đồng bộ.
- **Test:** `packages/sync-client/test/scenarios/table-opened-offline-is-owned-by-device.test.ts`.

---

## Phase 05 — QR, hóa đơn, chốt ngày ⇒ R1 ([phase](phase-05-thanh-toan-qr-hoa-don-dien-tu-chot-ngay-bao-cao.md))
- **Trạng thái:** done theo cách khác (2026-10-21) — thay "máy mở bàn giữ bàn" bằng `expectedVersion` + làm lại trên bản server + báo xung đột (D-069), sơ đồ dựng từ bootstrap + feed nên mất mạng vẫn có (D-070).

### T05-01 `payment_intent` + payload VietQR
- **Test:** `packages/domain/src/payment/vietqr-payload-crc.test.ts` — so với QR mẫu của ngân hàng.
- **Trạng thái:** done (2026-10-20) — `domain/payment` buildVietQrPayload/parseVietQrPayload + CRC-16/CCITT-FALSE; lệnh payment.create_intent/cancel_intent.

### T05-02 Webhook + chữ ký + `bank_transaction` unique
- **Test:** `apps/api/test/integration/payments/webhook-is-idempotent.test.ts` — gửi 10 lần = 1 thanh toán; chữ ký sai bị chặn.
- **Trạng thái:** done (2026-10-20) — `POST /webhooks/payments/:gateway/:tenantRoute`, adapter SePay + PayOS (+ fake), bank_transaction chỉ-thêm unique (gateway, reference_code). PayOS: cần đối chiếu sandbox.

### T05-03 Khớp tự động + đẩy realtime
- **Trạng thái:** done (2026-10-20) — khớp tự động theo mã nội dung FNB+8 ký tự; snapshot intent qua change_log. Màn QR tự đổi trạng thái trên POS chưa nối.

### T05-04 Màn khớp tay
- **Test chung:** `apps/api/test/integration/payments/match-under-over-duplicate.test.ts`.
- **Trạng thái:** done phía API (2026-10-20) — `GET /payments/unmatched`, `POST /payments/match`; UI backoffice chưa.

### T05-05 Hồ sơ HĐĐT theo chi nhánh
- **Trạng thái:** done (2026-10-20) — hồ sơ HĐĐT theo chi nhánh qua config (regime `nd254-tt91`, ký hiệu có M).

### T05-06 Adapter nhà cung cấp HĐĐT
- **Test:** `apps/api/test/integration/einvoice/provider-adapter-contract.test.ts` (fake ghi lại lời gọi + sandbox thật chạy tay).
- **Trạng thái:** một phần (2026-10-20) — interface EInvoiceProvider + FakeEInvoiceProvider; adapter thật chờ sandbox nhà cung cấp.

### T05-07 Phát hành mỗi thanh toán + hàng đợi + mã tra cứu trên bill
- **Test:** `apps/api/test/integration/einvoice/{one-invoice-per-payment,queued-while-offline}.test.ts`.
- **Trạng thái:** done phía server (2026-10-20) — 1 hóa đơn mỗi lần thanh toán, hàng đợi SKIP LOCKED + lease, backoff 30s→1h, tối đa 20 lần; snapshot đơn mang mã tra cứu. UI POS chưa.

### T05-08 Thông tin người mua
- **Test:** `e2e/pos/invoice-with-buyer-tax-code.spec.ts`.
- **Trạng thái:** done phía server (2026-10-20) — `order.set_buyer_info`; UI POS chưa.

### T05-09 Gửi cuối ngày + cảnh báo
- **Test:** `apps/api/test/integration/einvoice/daily-batch-submission.test.ts`.
- **Trạng thái:** done (2026-10-20) — einvoice_daily_batch gửi theo ngày kinh doanh.

### T05-10 Hoàn tiền sau khi có hóa đơn (theo T00-05)
- **Trạng thái:** blocked — chờ kế toán (T00-05).

### T05-11 Chốt ngày kinh doanh
- **Test:** `apps/api/test/integration/day-close/end-of-day-close.test.ts` — còn ca mở thì không chốt.
- **Trạng thái:** done phía API (2026-10-20) — `POST /branches/:id/day-close` (view_reports + accept_close_difference).

### T05-12 Báo cáo cơ bản
- **Test:** `apps/api/test/integration/reports/revenue-definitions.test.ts` — gộp/giảm/thuần/thuế/hoàn khớp bảng tay.
- **Trạng thái:** done phía API (2026-10-20) — `GET /reports/daily-sales` (gộp/giảm/thuần/thuế theo thuế suất/phí dịch vụ/hoàn/phương thức/giờ/món); UI chưa.

### T05-13 Chạy song song 3–5 ngày + go-live R1 — Claude + `user`
- **Xong khi:** số từng ngày khớp phần mềm cũ; checklist go-live ký.

---

## Phase 11 (phần vận hành, xong trước R1) ([phase](phase-11-saas-thuong-mai-dang-ky-goi-cuoc-van-hanh.md))
- **Trạng thái:** user — chờ quán thí điểm + vỏ máy quầy + máy in thật.

### T11-01 Giám sát lỗi client + server (có tenant_id, không log dữ liệu cá nhân)
- **Trạng thái:** xong phần tự dựng (2026-10-29) — lỗi 500 của server ghi log kèm tenant, che bí mật (D-064, `apps/api/src/http/server-error-report.test.ts`); lỗi máy quầy / trang quản lý gửi `POST /client-errors`, che dữ liệu, ghi cùng nhật ký (D-122): `apps/api/src/client-errors/scrub-client-error.test.ts`, `apps/api/test/integration/client-errors/clients-report-their-faults.test.ts`, `packages/contracts/src/client-errors/client-error-report-schema.test.ts`, `apps/pos/src/features/client-errors/client-error-reporter.test.ts`, `apps/pos/src/app/{pos-error-boundary,till-reports-faults}.test.tsx`, `apps/backoffice/src/lib/client-errors/backoffice-reporter.test.ts`, `apps/backoffice/src/components/shell/crash-page.test.tsx`. Chưa: trang xem/gom lỗi, cảnh báo khi lỗi tăng, source map.

### T11-02 Backup tự động + diễn tập khôi phục — ghi `infra/restore-drill.md`
- **Trạng thái:** done (2026-10-21, `9071dae`) — D-067: `pnpm ops:backup|ops:restore`, cron backup, `infra/restore-drill.md`; URL ping + đích rclone chờ chủ dự án.

### T11-03 Staging + dữ liệu giả (gồm bộ dữ liệu xấu)
- **Trạng thái:** một phần (2026-10-20) — `pnpm dev:stack` có quán mẫu "Cà phê Mẫu"; staging cần server thật (chủ dự án).

### T11-04 Cập nhật app quầy: nóng, chặn giữa ca, quay lui
- **Trạng thái:** xong phần bản web (2026-10-29, D-123) — build đóng dấu mã bản + `version.json`; máy quầy hỏi `version.json`, bản KHÁC là có cập nhật (quay lui cũng tới máy); chính sách áp dụng là hàm thuần (`apps/pos/src/features/updates/update-policy.test.ts`), người hỏi (`release-watch.test.ts`), thẻ (`apps/pos/src/screens/update/update-banner.test.tsx`), hook + máy quầy (`apps/pos/src/app/{use-app-update,till-offers-updates}.test.tsx`), mã bản (`apps/pos/build-release.test.ts`). Quy tắc runbook: server luôn nhận lệnh bản POS ngay trước. **Bản tối thiểu bắt buộc xong (2026-10-30, D-141):** `FNB_MIN_POS_BUILD` ở máy chủ, máy gửi số bản ở `x-fnb-pos-build`, 426 giữ lệnh trong outbox + màn "Cần cập nhật máy bán hàng" (`apps/api/test/integration/sync/sync-refuses-a-till-below-the-minimum-build.test.ts`, `apps/pos/src/app/till-must-update-when-the-server-says-so.test.tsx`, `packages/sync-client/test/scenarios/till-below-the-minimum-build-keeps-its-commands.test.ts`); cài bản mới chép `assets/` của bản trước (D-142, `scripts/src/release/install-and-rollback-scripts.test.ts`). Chưa: vỏ native (xem Backlog).

### T11-05 Pipeline deploy (staging tự động, production bấm tay)
- **Trạng thái:** một phần (2026-10-29) — `infra/` hướng dẫn deploy tay 1 server Ubuntu (D-067); `pnpm release:pack` đóng gói tarball + checksum + manifest, `infra/release/{install,rollback}-release.sh` cài / đổi bản nguyên tử / tự quay về khi `/health` hỏng / từ chối quay lui qua migration, bước CI tải artifact 14 ngày (D-124): `scripts/src/release/{pack-release,install-and-rollback-scripts}.test.ts`. Chưa: job CI đẩy lên server (không có server; deploy thật cần chủ dự án), chạy thật trên Ubuntu — xem `docs/release-r1-waiting-on-real-things-checklist.md`.

---

## Backlog phát sinh

(Việc mới nảy ra trong lúc làm — ghi: ngày, mô tả, vì sao, gợi ý phase.)

> Nhãn `[đợt 4]` … `[đợt 7]` từ 2026-10-29 trở đi theo kế hoạch tới R1 (Bàn giao 2026-10-28 12:05 và 2026-10-29 17:30: 4 vận hành · 5 vẽ lại màn máy quầy + ô chọn · 6 D-097, D-096, D-083, D-095, D-082, "Cần xử lý" · 7 quán giả lập). Ngoài các đợt còn `[sau R1]` (không chặn quán thí điểm), `[thấp]`, `[R2]`, `[khi làm luồng đó]`. Các dòng 2026-10-20 … 10-28 đã rà lại 2026-10-29 và xếp theo nhãn ở mục con cuối; dòng mới thì gắn nhãn ngay lúc ghi. Việc chờ server / máy thật / tài khoản nằm ở [release-r1-waiting-on-real-things-checklist.md](release-r1-waiting-on-real-things-checklist.md), không ở đây.

- 2026-10-29 · **[đợt 7]** **Quán giả lập** (`scripts` hoặc gói test riêng, ~1 agent 300–400k):
  - **Máy ảo:** nhiều máy quầy ảo chạy đúng `@fnb/sync-client` với API thật trên Postgres nhúng (2 quầy, 1 máy order bàn, 1 máy pha chế).
  - **Kịch bản một ngày:** mở ca → sáng vắng → trưa cao điểm → chiều thưa → đóng ca → chốt ngày, xen chuyển bàn, hủy món, hoàn tiền, QR báo có trễ.
  - **Bơm sự cố:** mất mạng một máy 20′, lệch giờ, server khởi động lại giữa giờ, hai máy cùng sửa một bàn, cập nhật app giữa ca.
  - **Cuối ngày tự kiểm:** không mất / trùng đơn, két khớp, báo cáo ngày = tổng dòng, mọi máy cùng trạng thái server.
  - **Chạy:** tầng nhanh không trình duyệt (cả ngày trong vài phút, kịch bản ngẫu nhiên có seed), cộng 3–4 Chrome chạy giao diện máy quầy thật cho vài đoạn chính.
  - **Vì sao sau đợt 6:** đợt 6 đổi số gọi khi ≥ 2 máy (D-082), khóa món đã gửi bếp (D-097), "Cần xử lý".
- 2026-10-29 · **[chờ chủ dự án gửi link]** Cắm máy quầy vào một **game giả lập bán hàng** (repo public), chạy ở máy dev.
  - **Ưu tiên mức 1:** game hiện khách + món gọi, người thật bấm trên máy quầy thật.
  - **Mức 2 / 3:** game tự bấm giao diện, hoặc bơm đơn vào server. Chỉ làm nếu rẻ, vì mức 3 trùng đợt 7.
  - **Cách xem repo:** đọc chỉ-đọc trước (~20–40k: engine, chỗ móc vào lúc khách gọi món, giấy phép). Lớp chuyển đổi ~100–200k.
  - **An toàn:** game và lớp chuyển đổi để **ngoài** repo này (repo public, không chép code người khác). Đọc script cài / chạy của game trước khi chạy, chạy ở thư mục cách ly.
~~- 2026-10-29 · **[đợt 5]** Thẻ cập nhật nằm góc dưới trái, đè một phần lưới món lúc ca mở; cho vuốt tắt / thu nhỏ khi vẽ lại màn bán.~~ **Xong** (D-128).
~~- 2026-10-29 · **[đợt 5]** Màn sự cố máy quầy (và màn "đang mở ở tab khác") dùng khung đăng nhập chung: thẻ nằm trên cùng, phần dưới trống. Vẽ lại cùng nhóm màn ghép máy / PIN / chọn nhân viên.~~ **Xong** (D-127).
- ~~2026-10-29 · **[đợt 6]** Ép phiên bản POS tối thiểu: server từ chối lệnh của bản quá cũ và máy quầy hiện màn bắt buộc cập nhật (hiện máy chỉ được mời cập nhật, không bị ép). Cần trước khi có thay đổi hợp đồng không tương thích ngược sau R1. → T11-04.~~ **Xong** (D-141, commit ở "Bàn giao phiên trước").
- ~~2026-10-29 · **[đợt 6]** Máy quầy đang mở từ bản cũ có thể tải lỗi một file `assets/` (chunk) mà bản mới đã xóa khỏi server; hiện màn sự cố cho tới khi tải lại. `install-release.sh` chép `assets/` của bản trước sang bản mới (tên có băm, không đụng nhau). → T11-04.~~ **Xong** (D-142, commit ở "Bàn giao phiên trước").
- 2026-10-29 · **[khi có vỏ native]** Vỏ Tauri/Capacitor cần đường cập nhật riêng (cập nhật gói web trong vỏ, hoặc cập nhật vỏ); bản web dùng `version.json` chưa áp dụng được. → T11-04 / phase vỏ máy quầy.

- ~~2026-10-29 · **[đợt 6]** Mẫu loại quán đặt `pay_first_counter = false` cho quán ăn và quán bar…~~ **Xong** (D-138, commit ở "Bàn giao phiên trước"): `planTemplate` bỏ qua công tắc khóa ("Giữ nguyên", lý do `locked`), `course_firing` hiện "Sắp có"; B1, B2, Q13 gỡ.
- ~~2026-10-29 · **[đợt 6]** Lưu trữ trạm: trạm đã từng in phiếu không xóa được (D-118) nên ở lại danh sách và ô chọn mãi. Thêm `archived_at` cho trạm, ẩn khỏi danh sách + ô chọn, phiếu cũ vẫn trỏ được; sửa trang sổ tay 15.~~ **Xong** (D-146, commit ở "Bàn giao phiên trước").
- ~~2026-10-29 · **[thấp, đợt 6]** Không lệnh xóa nào của trang quản lý kiểm `version` (`versioned-resource-routes.ts`, `price-list-routes.ts`, bàn, khu vực): người A xóa được bảng giá người B vừa sửa mà không biết. Sửa thì sửa chung: gửi `version`, lệch thì 409.~~ **Xong** (D-145, commit ở "Bàn giao phiên trước"): `?version=` ở mọi lệnh xóa của danh mục, trạm, bảng giá, khu vực, bàn; 409 + trang tải lại.
- 2026-10-30 · **[thấp]** Vai trò vẫn ghi sau thắng: `PATCH /roles/:id`, `DELETE /roles/:id`, `POST /roles/:id/archive` chưa kiểm `version` (và khóa / mở lại nhân viên, đặt lại PIN) — làm cùng cách `?version=` của D-145.
- ~~2026-10-29 · **[đợt 5]** Ô chọn món / danh mục / size trong quy tắc bảng giá là danh sách cuộn, chưa có ô tìm — thương hiệu vài trăm món khó chọn. Thêm tìm bỏ dấu vào `Listbox`, dùng lại cho các ô chọn đợt 5 thay.~~ **Xong** (D-125, commit ở "Bàn giao phiên trước").
- 2026-10-29 · **[trước khi có quán 2 chi nhánh]** Món thuộc thương hiệu nhưng `product.station_id` trỏ trạm của một chi nhánh ⇒ ở chi nhánh khác món không ra phiếu bếp (sổ tay 15). Cần gán trạm theo (món, chi nhánh) + bootstrap + trình sửa món. Câu hỏi mô hình đã có từ dòng 2026-10-20 "Backoffice: trạm thuộc chi nhánh…".
- 2026-10-29 · **[R2, cùng kênh giao hàng]** Quy tắc bảng giá có kênh nhập được nhưng máy quầy không bán qua kênh nào nên không áp (sổ tay 14). Khi có kênh thật: kênh thành danh sách chọn thay ô chữ, đơn mang kênh, `resolvePrice` nhận kênh. Cùng nhóm: nhóm khách, số lượng tối thiểu (T03-06).
- 2026-10-29 · **[R2]** Mẫu loại quán chưa có giờ cắt ngày kinh doanh theo kiểu quán (bar thường 06:00; hiện 04:00 cho mọi chi nhánh, không chỉnh được) và nhóm tùy chọn mẫu (size, đường, đá, topping) — D-119, sổ tay 16.
- 2026-10-29 · **[thấp, khi có chi nhánh ngoài Việt Nam]** Trang quản lý đổi ngày dd/mm/yyyy của bảng giá sang giờ máy chủ theo +07:00 cố định (đúng cho mọi chi nhánh trong nước vì Việt Nam không đổi giờ); giờ trong ngày đã theo giờ chi nhánh.

- ~~2026-10-29 · **[đợt 6]** Hiệu ứng đóng còn thiếu ở đường "xong việc": các bước phủ lên đơn (hủy món, hủy đơn, giảm giá, duyệt, tùy chọn, combo) chỉ có chuyển động khi bấm **Quay lại** / Esc; khi xong việc (đã hủy, đã duyệt) luồng đổi trạng thái nên màn biến mất ngay. Cần luồng gọi `leave()` rồi mới đổi trạng thái. Thẻ xác nhận / thông báo nằm trong trang (ConfirmPanel, `.pos-confirm`) cũng chưa có chuyển động đóng.~~ **Xong** (D-147, commit ở "Bàn giao phiên trước"): `useFinishThen`, `Presence`; phiếu chốt ca xem trước bị cắt cũng xong (`SlipPaper`, test `slips-read-whole-in-chrome.test.ts`).
- 2026-10-29 · **[thấp]** `usePresence` có hai bản (trang quản lý `lib/motion/use-presence.ts`, máy quầy `screens/shared/use-leave-motion.ts`) vì chưa có gói DOM dùng chung; gộp khi có gói đó (cùng việc với code thu lỗi chép lại).
- 2026-10-29 · **[thấp]** Dải cập nhật thu nhỏ rồi chỉ nhớ trong phiên hiện tại của màn; mở lại ca là dải mở rộng. Chưa có vuốt để tắt hẳn (cố ý: tắt hẳn làm mất tín hiệu "có bản mới").
- 2026-10-29 · **[thấp]** Màn đăng nhập: chưa kiểm ở giao diện "Rang xay" và "Tối" trên màn dọc 1080×1920 bằng ảnh; bản chụp tay chỉ ở pastel (1024, 1366, 1920) cùng dark (768×1024) và rangxay (1920×1080). Màn khóa PIN 5 lần vẫn dùng câu lỗi chung.
- 2026-10-29 · **[thấp]** Ngăn kéo thanh toán ở QR / ví chưa được vẽ lại riêng (chỉ khối Cần thu, hai thẻ, nút tiền mặt); panel QR giữ kiểu cũ.

### Dòng 2026-10-20 … 10-28 sau khi rà (2026-10-29)

> Rà từng dòng bằng grep trong code, không agent. Dòng đã xong gom vào "Đã xong khi rà" cuối mục (nguyên văn cũ ở lịch sử git của file này). Dòng ghi "chưa kiểm lại" là chưa tìm được bằng chứng trong code: kiểm trước khi làm, có thể đã xong. Việc chờ máy in, server, tài khoản, kế toán đã chuyển sang [release-r1-waiting-on-real-things-checklist.md](release-r1-waiting-on-real-things-checklist.md).

**[đợt 5]**

- ~~2026-10-28 · Trang quản lý còn **12** ô chọn của trình duyệt (`SelectField`) ở 9 file: sửa món (Danh mục, Trạm), nhập Excel (2), chuyển danh mục hàng loạt, tiền QR cần hoàn, hồ sơ HĐĐT (2), tài khoản nhận tiền, phạm vi cài đặt, khóa webhook, công cụ nhân viên. Đổi hết sang `Listbox` (kèm ô tìm bỏ dấu, dòng 2026-10-29 ở trên). Máy quầy không còn `<select>` nào.~~ **Xong** (D-125, commit ở "Bàn giao phiên trước").

**[đợt 6]**

- ~~2026-10-30 · **[đợt 6]** Cần xử lý xử lý được từng lệnh (T04-04).~~ **Xong** (D-137, commit ở "Bàn giao phiên trước").
- 2026-10-30 · **[đợt 7]** Bỏ qua lệnh có tiền / phiếu bếp ở "Cần xử lý" hiện chỉ cần lời ghi + audit; nên cần quản lý duyệt (quyền mới hoặc `close_unpaid_table`) như hủy đơn đã gửi bếp.
- 2026-10-30 · **[thấp]** "Mở đơn / bàn" từ "Cần xử lý" với đơn bàn chỉ đưa tới sơ đồ bàn (chưa mở thẳng bàn đó).
- 2026-10-30 · **[đợt 7]** Sửa tùy chọn / topping / ghi chú của món đã gửi bếp bằng MỘT thao tác "Đổi tùy chọn" (hủy món có duyệt + thêm lại với tùy chọn mới, hai phiếu). Hiện làm tay hai bước (D-134).
- 2026-10-30 · **[thấp]** Trang quản lý Thiết bị chưa hiện số thứ tự máy (1–9, cột `device.call_index`); chi nhánh có hơn 9 máy: máy thứ 10 trở đi giữ số gọi 1–99 nên có thể trùng số gọi.
- 2026-10-30 · **[thấp]** Máy ghép từ trước chỉ nhận số thứ tự máy ở lần tải khởi động đầu sau khi cập nhật (migration không điền được vì quyền hàng theo tenant); trước đó vẫn gọi 1–99.
- ~~`kitchenStillHasItems` từng tính cả dòng hủy…~~ **Xong** (D-137, commit ở "Bàn giao phiên trước"; máy chủ `cancel-order-command.ts` đã sửa cùng cách tính, test hủy nhiều lượt).
- 2026-10-30 · **[đợt 7]** Test API cho hủy một phần-lẻ món cân đã gửi bếp (`order.void_line` quantity "3.51") trên máy chủ thật: máy quầy gửi đúng, test máy quầy dùng máy chủ giả.

- ~~Món đếm cái vẫn nhận số lượng lẻ ("1.5") trong `order.save_draft`.~~ **Xong** (D-140, commit ở "Bàn giao phiên trước").
- ~~Combo: `PUT /catalog/products/:id` chưa từ chối phần combo trỏ tới combo khác hoặc món đã ngừng bán.~~ **Xong** (D-140, commit ở "Bàn giao phiên trước").
- ~~2026-10-28 · Hủy món **bán theo cân** đã gửi bếp: `VoidRequest.units` của máy quầy (`features/order-adjust/void-line-adjustment.ts`) đếm số nguyên ⇒ một lần cân 351 g không hủy được sau khi gửi bếp. Hợp đồng `order.void_line` đã nhận `quantity` lẻ; cho hủy nguyên lần cân.~~ **Xong** (D-132, commit `202ee0b`).
- ~~2026-10-20 · Máy quầy bị thu hồi: chưa thấy đường xóa thông tin ghép rồi về màn ghép. Lỗi 401 hiện chỉ xử lý phiên nhân viên (`apps/pos/src/app/use-background-sync.ts`). Chưa có route đăng xuất phiên nhân viên (`/pos/staff-sessions` chỉ có POST và GET `current`).~~ **Xong** (D-143, D-144, commit ở "Bàn giao phiên trước"): máy bị thu hồi hiện màn riêng, liệt kê thao tác chưa gửi, ghép lại có xác nhận; `DELETE /pos/staff-sessions/current` + nút Đăng xuất.
- ~~2026-10-20 · Bàn trống mà đơn đã xóa hết món vẫn giữ bàn: chưa kiểm lại; kiểm cùng D-097. Gộp bàn: R2.~~ **Xong** (D-133, commit `202ee0b`): D-088 ghi nút "Trả bàn" nhưng code chưa có; đã làm.
- ~~Hủy đơn trên bản lạc quan có thể không xin duyệt rồi bị server từ chối (luật D-063).~~ **Xong** (D-137, commit ở "Bàn giao phiên trước"; máy chủ `cancel-order-command.ts` đã sửa cùng cách tính, test hủy nhiều lượt).
- ~~2026-10-21 · `PATCH /staff` ghi sau thắng, chưa có `version`. Gộp vào dòng 2026-10-29 "Không lệnh xóa nào… kiểm `version`".~~ **Xong** (D-145, commit ở "Bàn giao phiên trước").
- ~~2026-10-20 · Đổi topping sau khi món đã gửi bếp chưa được coi là thay đổi (phiếu bếp không ra lại). Làm cùng D-097.~~ **Xong theo hướng khác** (D-134, commit `202ee0b`): luật máy chủ và máy quầy khóa tùy chọn của món đã gửi nên đổi = hủy món + gọi lại; sửa tại chỗ chuyển thành dòng [đợt 7] bên dưới.

**[đợt 7] — quán giả lập kiểm luôn**

- 2026-10-29 · `test:api` chập chờn: `apps/api/test/integration/payments/money-the-bank-brought-is-never-dropped.test.ts` đỏ một lần ở `beforeAll` (`pairDevice`: "pairing answered 401") khi chạy cả bộ trên `main` `d824c0e`; chạy riêng 3/3 xanh, chạy lại cả bộ xanh.
  - Đã loại: hai test dọn mã ghép dùng database riêng; mã 8 ký tự / 30 chữ thì trùng gần như không thể; route ghép không đổi.
  - Còn nghi: thứ gì đó sửa `device_pairing_code` / `pairing_code_route` của tenant khác trên database dùng chung, hoặc đồng hồ của app thanh toán đi trước giữa lúc cấp và lúc ghép.
  - Lặp lại thì in body của 401 và trạng thái hàng mã trong DB lúc hỏng.
- 2026-10-30 · Hai test nữa đỏ khi cả bộ chạy song song trên máy tải nặng, chạy riêng thì xanh:
  - `sync-change-cursor-never-skips` ("follows change_seq as a number once it gains a digit"): timeout 30 s, **hai lần** (lần đầu cổng của lượt 6a, và cổng do agent lượt 6b tự chạy).
  - `apps/backoffice/src/components/menu/stations-screen.test.tsx` ("adds the first, refusing an empty name"): `findByText` hết 1 s chờ chữ báo lỗi, một lần.
  - Việc cần làm: đo thời gian thật của test feed khi chạy cả bộ (có thể chỉ cần chia nhỏ hoặc nới timeout, nếu đúng là chậm chứ không treo); test trang quản lý chờ theo nút / trạng thái thay vì theo giờ.
- 2026-10-28 · Combo chưa có e2e trình duyệt (`e2e/backoffice` tạo combo → `e2e/pos` bán combo, phiếu bar + bếp); hiện chỉ có test component và API.
- 2026-10-20 · Ratchet test của spike: phần hội tụ nhiều máy đã có ở `packages/sync-client/test/scenarios`. Chưa đối chiếu từng ca:
  - commit muộn (advisory lock);
  - phân trang qua `change_seq` 2 chữ số;
  - giao trùng đồng thời;
  - lô đảo thứ tự;
  - trạng thái máy = server (hash);
  - tổng ngày = tổng dòng.
- 2026-10-20 · Giảm % toàn đơn rồi hủy món: tầng ứng dụng phải áp lại phần trăm sau khi hủy. Chưa kiểm lại.
- 2026-10-21 · `voidsOfTheDay` / `cancelledOrderCount` (`apps/api/src/reports/daily-sales-report.ts`) chưa loại đơn sau chốt. Chưa kiểm lại.
- 2026-10-21 · Đơn bị trả hoặc hủy ở máy khác trong lúc nháp của máy này đang chờ ⇒ món của máy này mất, sơ đồ không báo.
- 2026-10-20 · `packages/sync-client/test/support/scenario-server.ts` chạy API trên đồng hồ thật trong khi lệnh ghi giờ cố định. Chuyển sang đồng hồ tay, cần cho kịch bản lệch giờ.
- 2026-10-20 · e2e bàn để lại nháp chưa trả ở bàn E3 trên stack chung ⇒ spec chốt ngày chạy sau trên cùng stack sẽ bị chặn.

**[sau R1] — không chặn quán thí điểm**

- 2026-10-28 · Chụp **đơn vị cân** (kg / 100 g) vào dòng đơn (`sales_order_line.measure_unit` + snapshot). Hiện đổi đơn vị khi còn đơn mở, hoặc in lại bill cũ, thì in sai đơn vị.
- 2026-10-30 · **[đợt 7]** Mã hàng (`product.code`, D-139) chưa vào bootstrap / feed của máy quầy: thêm khi máy quầy cần (tìm món theo mã, in mã trên phiếu), lọc theo máy xin để máy bản cũ không hỏng vì trường lạ.
- 2026-10-28 · Nhập/xuất Excel:
  - bỏ qua món theo cân và giá nhập tay;
  - chưa nhập tồn kho, giá vốn, ĐVT lớn, ảnh, thuộc tính → size, ghi chú nhanh, máy in theo tên (mã hàng: xong, D-139);
  - nhập đi từng món một (~1 lượt đi-về/món) ⇒ file vài nghìn món chậm; cần route nhập lô có transaction.
- 2026-10-20 · `change_log` giữ bao lâu và phình theo (món đổi × số chi nhánh): chưa có dọn. Dọn định kỳ D-066 chỉ lo mã ghép và phiên.
- 2026-10-20 · Đăng ký tổ chức mới: chưa có route (phase 11).
- 2026-10-21 · Bootstrap đọc từng đơn mở một (`apps/api/src/routes/pos/bootstrap-open-orders.ts`, N+1 truy vấn). Gom khi chi nhánh có nhiều bàn.
- 2026-10-21 · `order.void_line` dùng id dòng hủy do server sinh ⇒ offline, phiếu hủy có thể in 2 lần. Snapshot đơn chưa mang `shiftId` / `paidAt` / dấu hủy: chưa kiểm lại.

**[thấp]**

- 2026-10-21 · POS chưa đọc giờ server từ `/pos/bootstrap`, chỉ từ các lượt đồng bộ. Lệnh ghi trước lượt đầu được sửa giờ qua đường "thử lại", không mất.
- 2026-10-20 · Review cấp thấp, chưa kiểm lại:
  - A2: đúng PIN xóa luôn khóa của request song song.
  - A4: trigger `UPDATE OF account_id` chạy cả khi không đổi.
  - A5: uuid `urn:` hoặc chữ hoa ⇒ 500.
  - B3: `quantity(1e-7)` ra 0.
  - B6: builder "giảm X cho cả dòng".
  - C2–C5.
- 2026-10-20 · `save_draft` không đổi gì vẫn tăng version.
- 2026-10-20 · Chuyển `ProductDocumentInput` → `Product` viết 2 lần (api + backoffice) ⇒ gộp vào gói thuần. Lỗi 400 của domain chưa mang ids (groupId / optionId / variantId).
- 2026-10-21 · Bàn hoặc món lưu trữ trước bootstrap mà kho còn bản cũ thì vẫn hiện, tới khi feed gửi null.
- 2026-10-21 · Tenant mất hết membership thì phiên nhân viên cũ không được dọn.
- 2026-10-21 · dev stack: Postgres nhúng nhận Ctrl+C trước API.
- 2026-10-21 · Sơ đồ bàn có một bàn đặt rất xa thì cả sơ đồ co về góc.
- 2026-10-21 · Chưa kiểm lại:
  - khóa phương thức hoàn `bank_transfer`;
  - con số "trễ offline 2h" và "giữ mã QR 7 ngày" (2′ lệch giờ đã chốt ở D-054/D-062);
  - hết món có hạn (`unavailableUntil`) tự hết mà không sinh thay đổi ⇒ máy phải tự so giờ;
  - `test:ops` có ca cho việc đổi thế hệ server sau khôi phục;
  - nút gửi form trang quản lý canh phải như hộp thoại.
- 2026-10-21 · Ảnh món:
  - ảnh phục vụ công khai qua link;
  - ảnh cũ trên đĩa và trong Cache Storage của máy chưa dọn khi đổi hoặc xóa;
  - máy chạy bản cũ bỏ qua `imageUrl` tới khi tải lại;
  - khung "Xem trước" của trình sửa món vẫn hiện chữ cái;
  - `dev:stack --reset` không xóa `tmp/media`.
- 2026-10-20 · In (cùng phase in ấn native):
  - chưa có mẫu tạm tính riêng, máy quầy đổi tiêu đề bill;
  - bill chưa có dòng "Làm tròn";
  - chưa rõ in lại bằng job id mới có xóa lỗi cũ của cùng chứng từ không.

**[R2]**

- 2026-10-28 · Combo: hủy riêng **một món trong combo** và sửa món trong combo ngay trên dòng của đơn (hiện xóa/hủy nguyên combo, D-115).
- 2026-10-28 · Combo: cờ **món mặc định** cho phần có nhiều lựa chọn (Toast có), báo cáo bán theo **món trong combo** (dòng `combo_component` đã lưu), trừ kho theo thành phần khi có kho.
- 2026-10-20 · Tem ly: nhóm tùy chọn cần "vai trò" (đường, đá). Hiện `apps/pos/src/features/printing/cup-label-slip.ts` in mọi tùy chọn thành danh sách dưới tên ly.
- 2026-10-20 · Hết món theo kênh / có hạn chưa có UI (cùng nhóm kênh giao hàng). Gộp bàn. Hoàn tiền có nhập lại kho (phase kho).

**[khi làm luồng đó]**

- 2026-10-21 · Duyệt tại chỗ chưa gắn chủ thể: `price_override`, `comp_item`, `reopen_paid_order`, `stock_adjust` (cùng lỗ D-076: dùng được cho đơn khác trong 10′). `open_drawer` đã có chủ thể trong danh mục nhưng chưa có lệnh/luồng POS. Gắn khi làm các luồng đó (đã gắn: `open_price` D-105, `transfer_table` D-109).

**Ghi chú làm việc (không phải việc)**

- `/tmp` máy dev là tmpfs + quota chung (~7 GB/user). Gặp EDQUOT thì chuyển thư mục dữ liệu Postgres nhúng của test về ổ home. Số đo hiệu năng DB phải lấy trên ổ thật: trên tmpfs fsync gần như miễn phí, số đẹp gấp ~30 lần.
- `apps/backoffice` và `e2e` chưa được prettier định dạng. `prettier --write` sẽ viết lại cả file ⇒ chỉ định dạng file mình sửa.
- `next dev` viết lại `apps/backoffice/next-env.d.ts` mỗi lần chạy ⇒ cây bẩn. Chấp nhận, không stage file này.

**Đã xong khi rà 2026-10-29** (mỗi dòng: việc cũ → bằng chứng)

- Hoàn tiền phải thuộc ca (`order.refund` không ca) → D-108.
- Bẫy 12: kết quả `accepted` mang ảnh chụp đơn → `apps/api/src/sync/sync-wire-types.ts` (order "after the command").
- Kiểm cấu hình nhóm tùy chọn không thể thỏa → `unsatisfiableModifierGroup` trong `packages/domain/src/catalog`.
- `validateComboConfig` → `packages/domain/src/catalog/validate-combo-config.ts`.
- Kiểm tham chiếu `variantRules` → `variantRuleForUnknownVariant`.
- Bộ sinh id cho POS offline → `apps/pos/src/features/ids/new-id`.
- `computeOrderTotals` × dòng âm, hủy đối xứng → `order-line-reversal-mirror.ts` + test.
- Hoàn một phần đơn có giảm toàn đơn → `refund-charges-of-sale.ts` + D-079.
- Khóa quyền cho API trang quản lý + vai trò mẫu → `requirePermission`, `ROLE_TEMPLATES`.
- Giới hạn tần suất đăng nhập / ghép máy → D-065. Dọn mã ghép, phiên hết hạn → D-066.
- PIN khi offline → PIN chỉ kiểm trên server (`POST /pos/staff-sessions`), băm PIN không xuống máy (test chặn lộ `pinHash`).
- `approval_log` cho duyệt offline → D-057: duyệt tại chỗ cần mạng.
- `domain_version` của máy mới hơn server → `SYNC_DOMAIN_VERSION_UNSUPPORTED`.
- B1: server dựng dòng hủy / đơn hoàn từ ý định → `void-line-payload-schema.ts`, `order-line-reversal-rules.ts`.
- A3: migration tự `REVOKE EXECUTE` cho `fnb_auth` → migration 0010.
- B2: ngưỡng giảm giá theo tỉ lệ tích lũy của đơn → `draft-discount-guard.ts` (`discountRateOfOrder` trước/sau); thu/chi tích lũy theo ca → D-061.
- A1 + C1: khóa PIN leo thang → D-037, `apps/api/src/security/attempt-lockout.ts`.
- `edit_menu` cho mọi route `/catalog` → `catalog-route-handler.ts`.
- Nhóm tùy chọn dùng chung → D-087.
- Snapshot charge profile trên đơn → `apps/api/src/sync/charge-profile-snapshot.ts`.
- `FNB_LIFECYCLE_RUNS` → `order-lifecycle.property.test.ts`.
- Lệnh đồng bộ `void_line`, giảm giá, `refund`, hủy đơn → `packages/contracts/src/sync/commands/`.
- Charge profile theo chi nhánh → khóa cấu hình `charge_profile`.
- `save_draft` chặn món đang hết → `draft-additions.ts`; món giá mở / theo cân trong ý định dòng → D-107.
- Lệnh offline theo `staffSessionId` từng lệnh, qua lần tải lại → D-084.
- Làm tròn tiền mặt → `packages/domain/src/rounding/cash-rounding.ts`.
- Quản lý mở khóa PIN, đặt lại PIN → D-085; trang Nhân viên có sửa / PIN / mở khóa / khóa / mở lại.
- Hủy một phần làm "đóng băng" cây con → D-086.
- Hoàn tiền offline là lệnh ý định → `refund-order-payload-schema.ts`.
- Hai bản kiểm approval (ca và order) → đã hợp nhất (`approval-redemption.ts`, không còn `shift-command-approval.ts`).
- Approval khớp đúng giá trị / gắn đơn → D-076. `order.pay` không ca → D-078. Ngưỡng chênh lệch đóng ca → khóa cấu hình riêng (2026-10-22).
- Bill hoàn có giảm toàn đơn → D-079.
- `applied_command.staff_id` → migration 0016.
- POS parse bootstrap bằng schema của `@fnb/contracts` → `bootstrap-source.ts`. Ẩn nhân viên bị khóa → D-060. Phiên hết hạn ⇒ về màn PIN → `paired-till.tsx`.
- Số khách, giờ mở bàn offline → D-088. Hủy đơn gắn bàn → D-063.
- Route trang quản lý ghi cấu hình → `apps/api/src/routes/settings/`. `GET /branches`, `/devices`, `/staff`, `permissionKeys` trong `/auth/me` → `routes/branches`, `routes/devices`, `routes/staff`, `routes/auth/session-routes.ts`.
- Trang Nhân viên (sửa, khóa, đặt lại PIN, mở khóa) và lưu trữ / khôi phục vai trò → `components/staff`, `components/roles`, D-092.
- Tin `createdAt` của máy → D-054, D-062, D-077.
- `refundDue` "đã hoàn cho khách" → D-059. Tiền QR thối bằng tiền két tự ghi chi két → D-081.
- Đơn bàn: `openedAt`, `preBillPrintedVersion`, bootstrap mang đơn mở + sơ đồ → D-069, D-070. `save_draft` hai máy cùng sửa → D-060 + D-069.
- Câu tiếng Việt cho `SYNC_DEVICE_CLOCK_AHEAD`, `API_ORIGIN_NOT_ALLOWED`, `API_RATE_LIMITED` → `apps/pos/src/messages/`, `apps/backoffice/src/messages/vi-api-errors.ts`. Vùng chết khi kẹp giờ → D-062.
- POS / trang quản lý cùng origin qua proxy, `Access-Control-Expose-Headers` → D-050, D-091.
- QR thiếu / thừa ở quầy → D-080. Combo, giá mở, món cân trên POS → D-107, D-113.
- Danh sách lý do cố định trên POS → D-057.
- Khôi phục backup × máy quầy → D-068, D-090. Làm lại nháp STALE ở `SellingModes` → D-089.
- Giao diện: thanh toán dạng ngăn kéo hai thẻ, dòng giỏ gọn → D-073; lịch sử đơn dạng bảng → D-094; ảnh quán mẫu có nhãn hiệu → D-093.
- Trang quản lý menu ngang → D-102, `e2e/backoffice/hostile-top-menu-layout.spec.ts`. Danh sách người duyệt + quyền do server quyết → D-057. Két chung một ca → D-061.
- Role `fnb_owner` / `fnb_app` + default privileges cho FUNCTION (hai dòng 2026-10-20, đã gạch).
- Bước CI `test:ops` → chạy trên CI (cài `postgresql-client-17`).
