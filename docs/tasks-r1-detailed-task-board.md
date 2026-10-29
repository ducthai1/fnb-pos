# Bảng task chi tiết — tới R1

> Nguồn việc duy nhất của các phiên. Quy trình dùng: [development-workflow](development-workflow-for-claude-sessions.md).
> Trạng thái: `todo` · `doing (ngày)` · `done (ngày, commit)` · `blocked (lý do)` · `user` (việc của user, Claude chỉ nhắc/hỗ trợ).
> Mã task chỉ dùng trong tài liệu, **không** ghi vào code/test/commit.

## Bàn giao phiên trước

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
- **Trạng thái:** todo.

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
- **Trạng thái:** một phần (2026-10-20) — màn "Cần xử lý" + đếm trong app POS; chưa có thao tác xử lý từng lệnh.

### T04-05 POS: ghép máy, đăng nhập PIN, đổi người
- **Test:** `e2e/pos/pair-and-pin-login.spec.ts`.
- **Trạng thái:** done bản web (2026-10-20) — ghép máy bằng mã 8 ký tự, chọn nhân viên + PIN, token thiết bị trong IndexedDB (vỏ native phải dùng keychain); e2e `e2e/pos/pair-and-pin-login.spec.ts`. Đổi người chưa gọi logout server (chưa có endpoint).

### T04-06 Màn bán
- **Làm:** lưới món, tìm nhanh, chọn biến thể/tùy chọn, ghi chú, số lượng, giữ đơn, nhiều đơn song song.
- **Test:** `apps/pos/src/features/order/modifier-picker.test.tsx`; `e2e/pos/counter-sale-cash.spec.ts`.
- **Trạng thái:** done bản web (2026-10-20) — tab danh mục, tìm bỏ dấu, lưới món, bảng chọn tùy chọn theo luật domain, giỏ dạng cây, lưu nháp tự động. Chưa có: combo, ảnh món, mở lại nháp sau khi tải lại (giá mở + món cân: xong ở T04-07, 2026-10-28).

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
- **Trạng thái:** todo.

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
- **Trạng thái:** một phần (2026-10-21) — lỗi 500 của server ghi log kèm tenant, che bí mật (D-064, `apps/api/src/http/server-error-report.test.ts`); chưa thu lỗi phía máy quầy / trang quản lý.

### T11-02 Backup tự động + diễn tập khôi phục — ghi `infra/restore-drill.md`
- **Trạng thái:** done (2026-10-21, `9071dae`) — D-067: `pnpm ops:backup|ops:restore`, cron backup, `infra/restore-drill.md`; URL ping + đích rclone chờ chủ dự án.

### T11-03 Staging + dữ liệu giả (gồm bộ dữ liệu xấu)
- **Trạng thái:** một phần (2026-10-20) — `pnpm dev:stack` có quán mẫu "Cà phê Mẫu"; staging cần server thật (chủ dự án).

### T11-04 Cập nhật app quầy: nóng, chặn giữa ca, quay lui
- **Trạng thái:** todo.

### T11-05 Pipeline deploy (staging tự động, production bấm tay)
- **Trạng thái:** một phần (2026-10-21) — `infra/` hướng dẫn deploy tay 1 server Ubuntu (D-067); chưa có pipeline.

---

## Backlog phát sinh

(Việc mới nảy ra trong lúc làm — ghi: ngày, mô tả, vì sao, gợi ý phase.)

- 2026-10-28 · Combo: e2e trình duyệt (`e2e/backoffice` tạo combo → `e2e/pos` bán combo, phiếu bar + bếp) — hiện chỉ có test component/API. Gợi ý: cùng đợt e2e R1.
- 2026-10-28 · Combo: hủy riêng **một món trong combo** và sửa món trong combo ngay trên dòng của đơn (hiện xóa/hủy nguyên combo, D-115). Gợi ý: R2.
- 2026-10-28 · Combo: cờ **món mặc định** cho phần có nhiều lựa chọn (Toast có), báo cáo bán theo **món trong combo** (dòng `combo_component` đã lưu), trừ kho theo thành phần khi có kho. Gợi ý: R2 / phase kho.
- 2026-10-28 · Combo: API lưu món chưa từ chối phần combo trỏ tới **combo khác** hoặc món đã ngừng bán (trang quản lý không cho chọn; máy quầy/máy chủ từ chối lúc bán) — thêm kiểm ở `PUT /catalog/products/:id`. Gợi ý: phase 03.
- 2026-10-28 · Phiếu bếp combo chia nhiều trạm: một trạm in lỗi thì lần gửi sau in lại combo ở **mọi** trạm (D-114) — khi có máy in thật, cân nhắc ghi "đã gửi" theo từng phần (từng trạm). Gợi ý: phase in ấn native.
- 2026-10-28 · Trang sửa món: ô **Danh mục** và **Trạm** còn là ô chọn của trình duyệt (`SelectField`), chưa dùng `Listbox` như ô Loại / Cách tính giá.

- 2026-10-28 · Hủy món **bán theo cân** đã gửi bếp (bàn): màn Hủy món và `VoidRequest.units` đếm số nguyên ⇒ một lần cân 351 g không hủy được sau khi gửi bếp (trước khi gửi thì Xóa món được) — cho hủy nguyên lần cân (số lượng của dòng).
- 2026-10-28 · Chụp **đơn vị cân** (kg / 100 g) vào dòng đơn: máy đọc lại gam và in bill theo đơn vị **hiện tại** của món ⇒ đổi đơn vị khi còn đơn mở / in lại bill cũ là sai đơn vị. Cột `sales_order_line.measure_unit` + snapshot.
- 2026-10-28 · Cân điện tử: nối `WeighingScale` (`apps/pos/src/features/order/weighing-scale.ts`) qua vỏ native; ngăn nhập cân đã có nút "Đọc cân".
- 2026-10-28 · Món đếm cái vẫn nhận số lượng lẻ ("1.5") trong `order.save_draft` (máy chủ chỉ kiểm cân nặng của món theo cân) — chặn số lẻ cho món không bán theo cân.
- 2026-10-28 · HĐĐT chưa có đơn vị tính (ĐVT) trên dòng; món theo cân cần "kg"/"100 g" và số lượng lẻ.
- 2026-10-28 · Nhập/xuất Excel bỏ qua món theo cân / giá nhập tay (không có cột đơn vị, cách tính giá).

- 2026-10-22 · `order.refund` vẫn ghi được khi máy không có ca mở (luật D-078 mới áp cho `order.pay`) — áp cùng luật cho hoàn tiền mặt.
- 2026-10-22 · Ví điện tử: chưa hoàn tiền qua ví (bộ chuyển trả "chưa hỗ trợ"); báo cáo ngày chưa tách tiền ví khỏi chuyển khoản QR (cả hai là `qr_transfer`); chưa có e2e trình duyệt cho luồng ví; `expire_duration_seconds=900` sandbox nhận nhưng chưa thấy trong tài liệu chính thức (docs.zalopay.vn không phân giải được tên miền trên máy này — đã đối chiếu SDK Node chính thức + gọi sandbox thật).

- 2026-10-21 · Duyệt tại chỗ còn chưa gắn chủ thể (2026-10-28: `open_price` gắn dòng + giá đã gõ — D-105, `transfer_table` gắn đơn — D-109; còn lại chưa có tính năng nào dùng): `price_override`, `comp_item`, `reopen_paid_order`, `stock_adjust` (cùng lỗ D-076 với số tiền nhỏ hơn: dùng được cho đơn khác trong 10′); `open_drawer` đã có chủ thể trong danh mục nhưng chưa có lệnh/luồng POS. Gắn khi làm các luồng đó.
- 2026-10-21 · POS chưa đọc header giờ server từ `/pos/bootstrap` (chỉ từ các lượt đồng bộ); lệnh ghi trước lượt đồng bộ đầu được sửa giờ qua đường "thử lại", không mất. Máy chậm giờ nay cũng được bù theo server nên không còn bị kẹp ở −12h.

> 2026-10-21 16:30 — Mọi mục "chờ user / chờ quyết" bên dưới (trừ việc cần tiền thật, khóa thật, kế toán) đã được chốt ở **D-076…D-097** theo luật 7 của `CLAUDE.md`, cùng các chỗ lệch sổ tay tìm ra (`handbook/discrepancies.md`). Việc làm theo các quyết định đó: **đợt 10** (xem Bàn giao).

- 2026-10-20 · **[gấp, trước R1]** Bẫy 12 của spike S2: kết quả `accepted` phải mang ảnh chụp đơn sau khi áp để máy vẫn kéo được khi còn lệnh chờ; cần test hội tụ 2 máy giờ cao điểm (tỉ lệ từ chối ≈ 0). → T04-02/03.
- 2026-10-20 · Mang các "ratchet test" của spike sang `packages/sync-client` + `apps/api`: không bỏ sót thay đổi khi commit muộn (advisory lock), phân trang qua change_seq 2 chữ số, giao trùng đồng thời, lô đảo thứ tự ⇒ retry, chạy lần 2 trên dữ liệu cũ, trạng thái máy = server (hash), tổng ngày = tổng dòng. → T04-02/03.
- 2026-10-20 · Kiểm cấu hình nhóm tùy chọn không thể thỏa (min > số option khi không cho trùng, hoặc Σ maxQuantity < min). → T03-02.
- 2026-10-20 · `validateComboConfig` (slot min/max, option trùng, product id không tồn tại). → T03-02.
- 2026-10-20 · Kiểm tham chiếu cấp món: khóa `variantRules` và item bảng giá theo variant phải trỏ đúng variant của món; id item bảng giá không trùng. → T03-02.
- 2026-10-20 · Script/runbook tạo role `fnb_owner`/`fnb_app` + default privileges cho môi trường thật (hiện chỉ có trong test support). → T11-05.
- 2026-10-20 · `newId()` đang ở `@fnb/db`; POS offline cần cùng bộ sinh từ gói không phụ thuộc server ⇒ tách gói `ids` nhỏ khi bắt đầu POS. → T04-01.
- 2026-10-20 · Đăng ký tổ chức mới chạy bằng role app hay đường riêng — quyết ở T01-04.
- 2026-10-20 · **[gấp]** `computeOrderTotals` × dòng âm: gộp dòng hủy vào dòng nó đảo (cùng đơn), đơn hoàn (toàn dòng âm) tính đối xứng; test: hủy 1/2 ly = tổng của đơn 1 ly; hoàn toàn bộ = đúng số âm của đơn gốc. → đợt 3.
- 2026-10-20 · Hoàn một phần đơn có giảm giá toàn đơn/khuyến mãi: dòng hoàn phải mang phần giảm đã phân bổ (dùng `allocateAmount`) để không trả lại nhiều hơn khách đã trả. → đợt 3.
- 2026-10-20 · Gắn khóa quyền vào API backoffice (tạo mã ghép, tạo nhân viên, thu hồi thiết bị đang mở cho mọi member); kiểm `role.permission_keys` khớp danh mục; seed 6 vai trò mẫu khi tạo tổ chức. → đợt 3.
- 2026-10-20 · Môi trường thật cần default privileges cho FUNCTION (REVOKE EXECUTE FROM PUBLIC, GRANT cho role app) trước khi chạy migration — bổ sung vào runbook role. → T11-05.
- 2026-10-20 · Giới hạn tần suất `/auth/login`, `/devices/pair` (theo IP/thiết bị) — API hay proxy? → T11.
- 2026-10-20 · Job dọn mã ghép, route mã ghép, phiên hết hạn. → T11.
- 2026-10-20 · Xác minh PIN khi offline: gửi băm PIN 4–6 số xuống máy là brute-force được (≤ 1,1 triệu khả năng) dù có salt ⇒ quyết khi làm T04-05 (khóa gắn thiết bị / chỉ online / PIN dài hơn).
- 2026-10-20 · `approval_log`: thêm giờ duyệt trên máy (cho duyệt offline đồng bộ sau)? `device_id` cho phép NULL khi duyệt từ backoffice/điện thoại quản lý? → T04-17.
- 2026-10-20 · Máy có `domain_version` MỚI hơn server có được nhận không (cập nhật app trước server)? → T04-03.
- 2026-10-20 · **[đợt 4, high]** Review B1: dòng hủy/hoàn không được so với dòng gốc ⇒ thêm kiểm trong domain (giá, thuế, món, biến thể, cây con của dòng đảo khớp dòng gốc) + LUẬT: server áp lệnh *ý định* (`voidLine`, `buildRefund` dựng lại từ yêu cầu), không bao giờ nhận dòng đảo/đơn hoàn do máy quầy dựng.
- 2026-10-20 · **[đợt 4, medium]** A3: migration phải tự `REVOKE EXECUTE … FROM PUBLIC` cho hàm `fnb_auth` (hiện chỉ an toàn nhờ bước provision của test); test trên DB chỉ-migrate.
- 2026-10-20 · **[đợt 4, medium]** B2: ngưỡng giảm giá/thu-chi tính theo từng thao tác ⇒ giảm 3×10% = 30% không cần duyệt. Sửa: authorize theo tỉ lệ giảm *tích lũy* của dòng/đơn (helper domain), thu/chi tích lũy theo ca (ghi chú cho T04-16).
- 2026-10-20 · **[đợt 4, medium]** A1 + C1: khóa PIN leo thang (khóa lại liên tiếp ⇒ thời gian tăng, tối đa ~24h) + audit sự kiện khóa; test gửi lần thử PIN/đăng nhập song song.
- 2026-10-20 · **[đợt 4, low]** A2 (đúng PIN xóa luôn khóa của request song song), A4 (trigger `UPDATE OF account_id` chạy cả khi không đổi ⇒ xóa mọi phiên), A5 (uuid nhận `urn:`/chữ hoa ⇒ 500), B3 (`quantity(1e-7)` ra 0 thay vì bị chặn), B6 (giảm giá dòng tính theo đơn vị — cần builder "giảm X cho cả dòng"), C2 (test làm tròn VAT/phí dịch vụ theo công thức độc lập), C3 (nhân viên bị vô hiệu giữa ca; `/current` kiểm lại chi nhánh), C4 (grant mang trường thừa), C5 (test cho scrypt giả; thêm `fnb_auth.pairing_code_route` vào GLOBAL_TABLES).
- 2026-10-20 · Gắn `edit_menu` cho mọi route `/catalog`. → đợt 4.
- 2026-10-20 · Nhóm tùy chọn dùng chung: lưu món A có thể đổi/archive option mà món B cũng dùng — kiểm lại món B hay tách nhóm theo món? (chờ quyết)
- 2026-10-20 · Đơn đã thanh toán chưa lưu charge profile lúc bán ⇒ lưu snapshot profile trên đơn để hoàn tiền đúng khi chi nhánh đổi cấu hình. → T04-01.
- 2026-10-20 · Giảm % toàn đơn áp trước khi hủy món giữ số tiền cố định; hủy làm cơ sở nhỏ hơn số giảm ⇒ lỗi. Tầng ứng dụng phải áp lại giảm % sau khi hủy. → T04-17.
- 2026-10-20 · Bộ unit domain ~10s vì property 10.000 vòng đời — cân nhắc 2.000 khi chạy local, 10.000 trong CI (`FNB_LIFECYCLE_RUNS`).
- 2026-10-20 · Lệnh đồng bộ còn thiếu: `order.void_line` (save_draft phải chuyển sang cập nhật theo id khi đã có tham chiếu dòng), giảm giá (kiểm `approvalId`: đúng hành động, đúng nhân viên, dùng một lần), `order.refund` (đọc/ghi refund_line_amount), hủy đơn; payload từng lệnh khai trong `@fnb/contracts`. → đợt 5.
- 2026-10-20 · Charge profile hiện mặc định cứng (giá gồm VAT, không phí dịch vụ) — cần khóa cấu hình theo chi nhánh. → đợt 5.
- 2026-10-20 · `save_draft` có chặn món đang hết (product_availability) không? Món giá mở/cân chưa có trong ý định dòng. → đợt 5.
- 2026-10-20 · Lệnh offline × staff session: hiện chỉ đồng bộ khi có staff session đang sống, người tạo = người đang đăng nhập; cần tôn trọng staffSessionId theo từng lệnh. → T04-05.
- 2026-10-20 · `official_no` / `call_number` không gán được sau khi trả (trigger chỉ cho paid→posted) — luật riêng khi làm hóa đơn điện tử. → T05-07.
- 2026-10-20 · Làm tròn tiền mặt + tiền thừa: `order.pay` đòi Σ thanh toán = amountDue đúng từng đồng. → T04-08.
- 2026-10-20 · Giữ change_log bao lâu (trigger chỉ-thêm chặn cả owner) — cần migration/hàm dọn có chủ đích. → T11.
- 2026-10-20 · PIN khóa tới 24h ⇒ người đứng ở máy quầy có thể khóa quản lý cả ngày — cần thao tác mở khóa của quản lý/backoffice. → T01-10.
- 2026-10-20 · Sau khi hủy một phần, cây con của món bị "đóng băng" (không đổi topping, không thêm giảm dòng); món có giảm cả dòng phải gỡ giảm trước khi hủy. Chấp nhận ở quầy? (chờ user)
- 2026-10-20 · Hoàn tiền offline: `validateRefundAgainstSale` cần cùng danh sách hoàn trước mà máy quầy thấy ⇒ đồng bộ hoàn tiền nên là lệnh ý định server dựng lại. → đợt 5.
- 2026-10-20 · Hai bản kiểm approval: `apps/api/src/sync/shift-command-approval.ts` (ca) và bản của lệnh order.* — hợp nhất thành một; đăng ký lệnh shift.* vào `SYNC_COMMANDS` thay vì nhánh `isShiftCommand`. → đợt 6.
- 2026-10-20 · Duyệt: approval khớp ĐÚNG giá trị (duyệt 20% không dùng cho 19%)? Gắn approval với một đơn? Kiểm lại vai trò người duyệt lúc dùng? (chờ user)
- 2026-10-20 · `order.pay` khi máy không có ca mở ⇒ đang nhận với shift_id NULL (tiền mặt không thuộc két nào) — nên từ chối? Ngưỡng chênh lệch đóng ca mặc định 0 đ; theo từng phương thức? (chờ user)
- 2026-10-20 · Đóng ca có chuyển đơn đã trả sang `posted` không (đang không, để không cản hoàn tiền)?
- 2026-10-20 · Hoàn 1/3 ly có giảm toàn đơn hiện in gross −28.999 / giảm −3.333 (net đúng −25.666) — bill hoàn nên hiện giá bán gốc + dòng giảm? (chờ user)
- 2026-10-20 · In: CP1258 trên máy thật có in dấu thanh thành ô riêng không (lệch cột)? — kiểm ở T00-08; combo có thành phần khác trạm; thay topping sau khi đã gửi bếp chưa được phát hiện là thay đổi; bill chưa có dòng "Làm tròn".
- 2026-10-20 · `applied_command` chưa lưu staff_id của người gửi lệnh.
- 2026-10-20 · POS: parse `/pos/bootstrap` bằng schema của `@fnb/contracts` thay cho parser tối thiểu; ẩn/khóa nhân viên `active=false`; staff session hết hạn ⇒ về màn PIN (đang chỉ hiện server_error); thiết bị bị thu hồi ⇒ xóa credential + ghép lại; endpoint logout staff session. → đợt sau.
- 2026-10-20 · Lưu số khách (guest_count); `openedAt` của bàn lấy createdAt của lệnh mở (bàn mở offline đang hiện giờ đồng bộ); `save_draft` không đổi gì vẫn tăng version ⇒ mất trạng thái "chờ thanh toán"; hủy đơn đang gắn bàn có cần `close_unpaid_table`? (chờ quyết)
- 2026-10-20 · In: in lại bằng job id MỚI có xóa lỗi cũ của cùng chứng từ không? Đơn đã trả giờ tăng version khi gửi bếp — kiểm khi làm hóa đơn/báo cáo.
- 2026-10-20 · Chưa có route backoffice ghi cấu hình (charge profile, công tắc) — phải đi qua saveConfigValue/clearConfigValue + validateFlags. Hết món có hạn (`unavailableUntil`) tự hết không sinh thay đổi ⇒ máy tự so giờ.
- 2026-10-20 · change_log phình theo (món đổi × số chi nhánh) — cần chính sách giữ/gom. → T11.
- 2026-10-20 · Lưu trữ bản web POS: reverse proxy `/api` cùng origin (đang dùng) hay `VITE_FNB_API_BASE` + CORS? → T11-05.
- 2026-10-20 · POS: màn QR tự đổi trạng thái theo intent (đã có snapshot payment_intent); QR thiếu/thừa xử lý thế nào (QR thứ hai cho phần còn lại? tiền mặt? hoàn phần thừa?) — chờ user; mở lại nháp chưa trả sau khi tải lại; số gọi món nên do server cấp lúc trả?; nhóm tùy chọn cần "vai trò" (đường/đá) để in tem ly đúng; hồ sơ máy in theo máy quầy (khổ giấy, code page 1258); combo/giá mở/món cân trên POS.
- 2026-10-20 · `/tmp` là tmpfs + quota chung (~7 GB/user): Postgres nhúng của test để dữ liệu trong os.tmpdir() — nếu gặp EDQUOT thì chuyển thư mục dữ liệu test về ổ home.
- 2026-10-20 · **[gấp, đợt 8]** API thiếu `GET /branches`, `GET /devices?branchId=`, `GET /staff` (hợp đồng đề xuất trong `apps/backoffice` + `e2e/backoffice/support/pending-backoffice-read-routes.ts`); `/auth/me` chưa trả permissionKeys; chuyển ProductDocumentInput → Product bị viết 2 lần (api + backoffice) ⇒ gộp vào gói thuần; lỗi 400 của domain nên mang ids (groupId/optionId/variantId).
- 2026-10-20 · HĐĐT: adapter thật cần sandbox + câu hỏi idempotency của nhà cung cấp; bán của ngày đã chốt đồng bộ muộn ⇒ batch bổ sung tự động hay tay?; ai sửa/đẩy lại hóa đơn failed_permanent, có chặn chốt ngày không; đơn 0đ có xuất hóa đơn không; hoàn tiền: điều chỉnh hay chỉ ghi sổ (mặc định none) — chờ kế toán/user.
- 2026-10-20 · Backoffice: trạm thuộc chi nhánh nhưng món thuộc thương hiệu (product.stationId) — mô hình đúng chưa?; hết món theo kênh/có hạn chưa có UI; sửa/khóa nhân viên, đặt lại PIN, mở khóa PIN, xóa vai trò chưa có UI.
- 2026-10-20 · Còn tin createdAt của máy: giá khung giờ + hết món (save_draft), paid_at (pay/refund), sold_at HĐĐT, businessDate do máy chọn. Đề xuất: chặn createdAt > receivedAt + 2′ (SYNC_DEVICE_CLOCK_AHEAD), effectiveAt = clamp(createdAt, receivedAt − 12h, receivedAt) cho quyết định nghiệp vụ, lưu cả giờ máy + giờ server cho dấu thời gian pháp lý. → 9c.
- 2026-10-20 · `refundDue` (tiền QR đã nhận mà đơn không dùng) chưa có thao tác "đã hoàn cho khách"; con số trễ offline 2h, lệch đồng hồ 2′, giữ mã QR 7 ngày — chờ user.
- 2026-10-20 · Dữ liệu đo hiệu năng DB phải nằm trên ổ thật: `/tmp` máy này là tmpfs, fsync gần như miễn phí, số đẹp gấp ~30 lần.
- 2026-10-20 · Đơn bàn (đợt 9c): snapshot đơn chưa có `openedAt` (máy vừa kéo về hiện "Vừa mở" tới lần đọc sơ đồ sau); chỉ có `preBillPrinted` nên "đã đổi sau tạm tính" chỉ đúng trên máy đã thấy bản tạm tính ⇒ cần `preBillPrintedVersion`; bootstrap không mang đơn bàn đang mở ⇒ máy mới ghép thấy bàn có khách nhưng không mở được ("Đơn của bàn này chưa về máy") ⇒ bootstrap mang nháp mở của chi nhánh hoặc route đọc 1 đơn cho thiết bị. → 9d (server).
- 2026-10-20 · **ĐÃ SỬA (D-060 + D-069)** `save_draft` thay cả nháp: 2 máy cùng thêm món vào một bàn cùng lúc ⇒ lần lưu sau lặng lẽ bỏ món chưa gửi bếp của máy kia (chỉ dòng đã gửi/đã tham chiếu được giữ) ⇒ `expectedVersion` (409 khi lệch) hoặc lệnh thêm dòng. → 9d (server + POS).
- 2026-10-20 · Bàn trống mà đơn đã xóa hết món vẫn giữ bàn — cần thao tác giải phóng (order.cancel với lý do cố định?) — chờ user. Gộp bàn chưa làm.
- 2026-10-20 · Sơ đồ bàn không có trong feed ⇒ máy offline giữ sơ đồ lần đọc cuối; đưa sơ đồ vào bootstrap + feed? `@fnb/printing` chưa có mẫu tạm tính riêng (POS đổi tiêu đề bill).
- 2026-10-20 · Giờ máy (D-054): mỗi lần kẹp đều ghi audit, kể cả máy nhanh vài giây ⇒ cân nhắc vùng chết; `SYNC_DEVICE_CLOCK_AHEAD` nên là trạng thái thử lại được (máy sửa giờ rồi gửi lại) thay vì từ chối lưu sổ?; POS chưa có câu tiếng Việt cho `SYNC_DEVICE_CLOCK_AHEAD` và `API_ORIGIN_NOT_ALLOWED` (backoffice cũng vậy). → 9d.
- 2026-10-20 · `packages/sync-client/test/support/scenario-server.ts` chạy API trên đồng hồ thật trong khi lệnh ghi giờ cố định ⇒ sau 12h lệnh bị kẹp + audit (chưa assertion nào phụ thuộc) ⇒ chuyển sang ManualClock.
- 2026-10-20 · `next dev` viết lại `apps/backoffice/next-env.d.ts` (trỏ `tmp/next-dev/types`) mỗi lần chạy ⇒ cây bẩn; untrack cần sửa `.gitignore` (chờ user) hoặc chấp nhận.
- 2026-10-20 · Vận hành: `FNB_PAYMENT_SECRET_KEY` có nên bắt buộc ở production (thiếu thì QR không tự xác nhận)?; Postgres managed (RDS…): `ALTER DEFAULT PRIVILEGES FOR ROLE fnb_owner` cần admin là thành viên fnb_owner — ghi vào runbook; POS/backoffice cùng origin qua proxy hay CORS (FNB_ALLOWED_ORIGINS chỉ là kiểm Origin chống CSRF). → T11.
- 2026-10-20 · e2e bàn để lại nháp chưa trả ở bàn E3 trên stack chung ⇒ spec sau này chốt ngày trên cùng stack sẽ bị chặn.
- 2026-10-21 · **ĐÃ LÀM (D-069, D-070)** ~~[đợt sau, POS]~~ Dùng dữ liệu server mới của đợt 9d: đọc `openOrders` + `floor` từ bootstrap vào kho cục bộ; xử lý entity feed `staff_member`/`floor_area`/`floor_table` (null = xóa); gửi `expectedVersion` cho nháp bàn + làm lại khi `SYNC_ORDER_VERSION_STALE` (lời từ chối mang snapshot hiện tại) + câu tiếng Việt; "đã đổi sau tạm tính" từ `preBillPrintedVersion < version`; hiện `openedAt`.
- 2026-10-21 · **[đợt sau, server cho POS]** Bootstrap mang quyền duyệt được của từng nhân viên (để chỉ liệt kê người đủ quyền); snapshot ca mang thu/chi theo nhân viên + gửi lại khi có trả/hoàn vào ca + `openedAt` (tiền dự kiến lúc đóng ca hiện do máy tự dựng); ~~`shift_close_difference_tolerance` chưa có trong CONFIG_SETTING_DEFAULTS (máy coi = 0)~~ ĐÃ SỬA 2026-10-22 (máy nhận đúng ngưỡng của mình); `order.void_line` nhận id dòng hủy do máy sinh (offline phiếu hủy có thể in 2 lần); snapshot đơn thiếu `shiftId`/`paidAt`/dấu hủy (lịch sử không lọc theo ca; sau tải lại không biết dòng đã khóa); endpoint đăng xuất phiên nhân viên.
- 2026-10-21 · Chờ user: danh sách lý do hủy/hoàn do ai định, có cấu hình ở backoffice không; hoàn tiền có nhập lại kho không (đang luôn không); khóa phương thức hoàn `bank_transfer`; đặt lại PIN có kết thúc phiên đang mở không; vai trò lưu trữ có khôi phục được không, GET /roles có ẩn không; PATCH /staff có cần version (đang ghi sau thắng); mở khóa PIN tại máy bằng quyền mượn hay chỉ backoffice; tiền QR hoàn bằng tiền mặt từ két có tự ghi chi két không (D-059).
- 2026-10-21 · Bootstrap đọc từng đơn mở một (N+1 truy vấn) — gom khi chi nhánh có nhiều bàn. Adapter HĐĐT thật phải tôn trọng `ProviderCall.signal` và trả `lookup` theo id của mình.
- 2026-10-21 · apps/backoffice và e2e chưa được prettier định dạng — `prettier --write` sẽ viết lại cả file; chỉ định dạng file mình sửa.
- 2026-10-21 · Sau sửa review 8–9d (chờ quyết): phiếu đóng ca in theo số máy đang có — tiền mặt từ máy khác chưa kéo về kịp có thể làm phiếu lệch số server ⇒ in theo snapshot đóng ca của server?; tiền dự kiến tụt một nhịp khi lệnh trả đã nhận mà snapshot ca chưa về; tải lại POS thì lệnh còn chờ của người trước ghi cho người hiện tại (lưu token qua lần tải lại, hay server gán theo phiên kèm bằng chứng token?); hủy đơn trên bản lạc quan có thể không xin duyệt rồi bị server từ chối; dev stack: Postgres nhúng nhận Ctrl+C trước API; `voidsOfTheDay`/`cancelledOrderCount` chưa loại đơn sau chốt.
- 2026-10-21 · ~~**[GẤP — trước khi mở bán]**~~ **ĐÃ SỬA (D-068)** Khôi phục backup làm máy quầy lệch server: lệnh server đã nhận sau giờ backup thì máy coi là xong, không gửi lại (mất đơn); `device_seq` của máy đi trước sổ lệnh ⇒ `SYNC_OUT_OF_ORDER` mãi; con trỏ `change_seq` của máy lớn hơn server ⇒ bỏ lỡ thay đổi menu/giá/bàn. Cần cơ chế "thế hệ server" (server đổi thế hệ khi khôi phục ⇒ máy nhận ra, gửi lại lệnh còn giữ, kéo lại từ đầu). Hiện chỉ có cách làm tay trong `infra/restore-drill.md`.
- 2026-10-21 · Vận hành còn thiếu: câu tiếng Việt cho `API_RATE_LIMITED` ở POS/backoffice; Content-Security-Policy; cảnh báo khi backup không chạy; backup chép ra ngoài server (rclone đi đâu — chờ user); `FNB_PAYMENT_SECRET_KEY` bắt buộc ở production? (preflight đang chỉ cảnh báo); tenant mất hết membership thì phiên nhân viên cũ không được dọn; chưa thử TLS thật / máy Ubuntu sạch / systemd; bước CI `test:ops` (cài postgresql-client-17 từ PGDG) chưa chạy thử trên CI.
- 2026-10-21 · Sau khôi phục (chờ quyết): HĐĐT đã phát hành ở nhà cung cấp sau giờ backup — lệnh trả gửi lại có thể xin hóa đơn lần 2 (đối soát tay với nhà cung cấp?); QR tạo sau backup mất (đi qua API, không qua hàng đợi) ⇒ lệnh trả gửi lại bị từ chối vào "Cần xử lý" — đủ chưa?; POS có tự tải lại bootstrap sau khôi phục không (có thể mất đơn đang dựng trên màn); lệnh gửi lại ghi cho thu ngân đang đăng nhập nếu máy không còn phiên gốc; 7 ngày có đủ; khôi phục trước khi mọi máy đồng bộ ít nhất một lần với bản này thì không phát hiện được; `test:ops` chưa có ca cho việc đổi thế hệ (chạy được trên CI).
- 2026-10-21 · Sau D-069 (chờ quyết): làm lại STALE chỉ chạy khi chế độ bàn đang mở (sang quầy/tải lại trước khi có câu trả lời ⇒ chỉ nằm trong "Cần xử lý") — nâng lên SellingModes?; lời từ chối STALE đã làm lại vẫn hiện trong "Cần xử lý"; bàn/món lưu trữ trước bootstrap mà kho còn bản cũ hiện tới khi feed gửi null (so với `bootstrap.cursor`; menu cũng có lỗ này); đơn bị trả/hủy ở máy khác trong lúc nháp chờ ⇒ món của máy này mất, sơ đồ không báo; API khác origin cần `Access-Control-Expose-Headers: Retry-After`.
- 2026-10-21 · Nhập menu Excel: catalog không có mã hàng/sku ⇒ khớp món theo TÊN (không phân biệt hoa thường); file đổi tên món sẽ tạo món mới. Muốn khớp theo mã như KiotViet/empos thì cần cột `product.code` (migration + contract + bootstrap) — hỏi user. Chưa nhập: tồn kho, giá vốn, ĐVT lớn, ảnh (không tải từ URL), thuộc tính → size, ghi chú nhanh theo món, máy in theo tên.
- 2026-10-21 · Nhập menu Excel đi từng món một (`PUT /catalog/products/:id`, ~1 lượt đi-về/món, cập nhật = 2 lượt); file vài nghìn món sẽ chậm — nếu cần thì route nhập lô có transaction.
- 2026-10-21 · Giao diện (chờ chủ dự án quyết, agent làn 2 không tự làm vì đổi luồng/test): backoffice dùng menu NGANG như tham khảo?; thanh toán POS thành ngăn kéo với 2 thẻ Tiền mặt / Chuyển khoản (chọn một)?; dòng giỏ gọn một hàng (nút +/- cạnh tên)?; nút gửi form backoffice canh phải như hộp thoại tham khảo? Còn lại: lịch sử đơn vẫn dạng thẻ; sơ đồ bàn với một bàn đặt rất xa thì cả sơ đồ co về góc; câu báo `API_ORIGIN_NOT_ALLOWED` quá kỹ thuật với chủ quán — viết lại dễ hiểu.
- 2026-10-21 · Ảnh món (chờ quyết): vài ảnh CC0 quán mẫu lộ logo thương hiệu (Starbucks/Teavana, Peet's, Mister Donut…) — thay?; ảnh phục vụ công khai qua link; ảnh cũ trên đĩa + Cache Storage của máy chưa được dọn khi đổi/xóa; máy chạy bản POS cũ (schema strict) bỏ qua bản sao feed có `imageUrl` tới khi tải lại; khung "Xem trước" của trình sửa món vẫn hiện chữ cái; `dev:stack --reset` không xóa `tmp/media`.
