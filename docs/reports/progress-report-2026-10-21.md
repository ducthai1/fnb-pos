# Báo cáo đêm 20→21/10/2026 — fnb-pos

> Nối tiếp [báo cáo 20/10](progress-report-2026-10-20.md). Phạm vi: 21:25 (20/10) → 06:00 (21/10), từ `main` `73e2570` tới bản cuối ở §1.
> Chủ dự án bảo "tiếp tục, đừng dừng tới 6h" nhưng chưa trả lời §8 của báo cáo trước ⇒ mọi quyết định "chờ user" **vẫn chờ**, code chạy theo đề xuất. Phần cần duyệt ở §6.

---

## 1. Tóm tắt

- **Bấm thử được trên máy:** `pnpm dev:stack` dựng Postgres + API + POS + backoffice với quán mẫu "Cà phê Mẫu" (15 món, 12 bàn, 3 nhân viên), in sẵn tài khoản, PIN, mã ghép. Xem `README.md`.
- **POS đủ thao tác một ca bán thật:** bán tại quầy + **phục vụ tại bàn** (sơ đồ, nhiều lượt gửi bếp, tạm tính, chuyển bàn), **duyệt tại chỗ bằng PIN quản lý**, hủy món, giảm giá, hủy đơn, **hoàn tiền**, thu/chi két, **đóng ca đếm theo mệnh giá**, lịch sử đơn.
- **Sẵn sàng đặt lên một server cho quán thí điểm:** server chạy thật, giới hạn số lần thử đăng nhập/PIN, dọn dẹp định kỳ, **backup + khôi phục đã diễn tập**, hướng dẫn deploy Ubuntu, kiểm cấu hình trước khi mở; khôi phục backup **không làm mất đơn** của máy quầy.
- **Review vòng 3** (đợt 8–9d): 0 nặng, 2 trung bình, 7 nhẹ, 7 test hở — **đã sửa hết**.
- **Hai lỗi thật chỉ lộ ra sau nửa đêm / trên máy CI**, đã sửa: trang "In lỗi" lọc theo ngày lịch thay vì ngày kinh doanh; CI GitHub đỏ ~10 giờ vì máy CI chậm (test quá hạn giờ, e2e đọc DB quá sớm).
- **Làm lại giao diện** theo tham khảo empos.vn (chỉ học bố cục, tự viết lại) + **nhập/xuất menu từ Excel**: POS có thanh trên cùng rõ trạng thái mạng/ca, lưới món theo danh mục + giỏ bên phải, sơ đồ bàn **vẽ đúng vị trí**, phím tắt (F2 tìm, F8 tạm tính, F9 thanh toán, F10 gửi bếp, Esc quay lại), chip ghi chú nhanh ("Ít đá", "Không đường"…); backoffice có thanh bên có icon + nhóm, **trang chủ số liệu hôm nay + biểu đồ theo giờ**, bảng dữ liệu tìm/lọc/sắp xếp, sơ đồ bàn **kéo thả**, trình sửa món theo từng phần; **nhập/xuất menu Excel** đọc đúng mẫu `products-2026-06-13.xlsx` (xem trước, báo lỗi từng dòng, chạy lại không nhân đôi), chuyển nhiều món sang danh mục khác một lần.

## 2. Số liệu

| | 20/10 (báo cáo trước) | Sáng 21/10 |
|---|---|---|
| Commit trên `main` | 150 | 327 |
| Test unit | 2.083 | 2.593 |
| Test tích hợp (`test:api`) | 1.531 | 1.653 |
| Kịch bản đồng bộ (`test:sync`) | 16 | 20 |
| Test trình duyệt / e2e | 59 | 130 |
| Migration DB | 21 (→0023) | 28 (→0030) |
| CI GitHub | đỏ (chưa ai biết) | xanh |
| Chi phí hạ tầng | 0 đ | 0 đ |

## 3. Đêm nay đã làm gì

| Đợt | Token | Kết quả |
|---|---|---|
| 9c | 1,08M | `pnpm dev:stack` + quán mẫu; API chạy thật (D-055); giờ lệnh do server quyết (D-054); POS phục vụ tại bàn (D-056) |
| 9d | 1,31M | POS duyệt tại chỗ, hủy/giảm/hoàn, két, đóng ca, lịch sử (D-057); HĐĐT không phát hành trùng (D-058); "đã hoàn tiền QR cho khách" (D-059); công cụ nhân viên, phiên bản đơn bàn (D-060) |
| Review 3 | 0,50M | 16 phát hiện — `docs/research/review-wave-8-9d-findings.md` |
| Sửa review | 0,62M | đã sửa hết; D-061…D-064 |
| Vận hành | 0,43M | giới hạn tần suất, dọn dẹp, backup/khôi phục, deploy 1 server, preflight (D-065…D-067) |
| Khôi phục × máy quầy | 0,37M | "thế hệ server": máy gửi lại lệnh server mất + kéo lại từ đầu (D-068) |
| Bàn × 2 máy | 0,35M | POS gửi phiên bản đơn khi lưu bàn ⇒ 2 máy cùng thêm món không mất của nhau (có e2e: một máy bị giữ offline); sơ đồ + đơn mở lấy từ bootstrap/feed ⇒ máy offline vẫn có sơ đồ, máy mới ghép mở được bàn đang có khách (D-069, D-070) |
| Làn giao diện | 1,96M | 4 chặng nối tiếp, 104 commit: nền thiết kế (màu, chữ Be Vietnam Pro, icon lucide), POS, backoffice, nhập/xuất Excel — xem §1 và ảnh ở §6 |
| **Tổng đêm nay** | **≈ 6,6M** | (cộng dồn từ đầu dự án ≈ 18,4M) |

Phiên chính tự sửa: lỗi "In lỗi" theo ngày kinh doanh (`fbf014b`), CI chạy test từng gói một (`bbe3d80`), e2e chờ DB thay vì chờ chữ "đã đồng bộ" (`b856a1d`); và lỗi lộ ra khi gộp nhánh giao diện với nhánh bàn × 2 máy — sơ đồ bàn sập khi bootstrap mang sơ đồ (`65c6b7f`, có test chặn). Mọi bản đều push sau khi đủ 5 cổng + build xanh; CI GitHub xanh.

## 4. Bạn có thể làm ngay

```
cd ~/FileMySelf/FNB-POS/fnb-pos
pnpm dev:stack          # in ra địa chỉ, tài khoản chủ quán, PIN 3 nhân viên, mã ghép máy (10 phút)
```

Mở POS http://127.0.0.1:5173 và backoffice http://127.0.0.1:3300 (dùng đúng `127.0.0.1`). Kịch bản thử gợi ý: ghép máy → đăng nhập thu ngân → mở ca → bán quầy → bán tại bàn 2 lượt → giảm 20% (quản lý duyệt) → hoàn 1 ly → đóng ca. Backoffice: trang chủ, nhập menu từ Excel, báo cáo ngày, chốt ngày. Thử QR: `pnpm dev:bank-notice <mã FNB…> <số tiền>`.

## 5. Rủi ro còn lại

| Rủi ro | Mức |
|---|---|
| Chưa ai dùng tay ở quán; giao diện mới chưa được người thật duyệt | cao |
| Máy in thật (tiếng Việt CP1258), app cài trên máy quầy (Tauri/Capacitor) chưa làm — cần máy in + Rust/Android SDK | cao |
| Nhà cung cấp HĐĐT thật + luật NĐ 254/TT 91 chưa được kế toán xác nhận | cao |
| Deploy mới chạy thử trên máy dev (chưa TLS thật, chưa systemd, chưa server sạch) | trung bình |
| Repo vẫn **public** | trung bình |
| File Excel mẫu bạn gửi (dữ liệu đồ thời trang mẫu, đã bỏ link ảnh empos) được commit làm dữ liệu test `apps/backoffice/src/test-support/fixtures/products-export-24-columns.xlsx` — repo public; nếu không muốn, mình thay bằng file tự tạo | thấp |
| Phần lớn code đêm nay (giao diện 104 commit, khôi phục, bàn × 2 máy) **chưa qua review sâu** | trung bình |

## 6. Cần bạn duyệt

1. **Toàn bộ §8 của báo cáo 20/10** (12 quyết định + 8 câu hỏi) — vẫn chờ.
2. **Quyết định mới đêm nay** (đang chạy theo đề xuất, `docs/decision-log.md` D-054…D-068), đáng xem nhất:
   - D-063: hủy đơn đã in tạm tính hoặc đã gửi bếp phải có quản lý duyệt.
   - D-061: ngưỡng thu/chi két cộng chung cả ca (không theo từng nhân viên).
   - D-062: máy lệch giờ ≤ 2′ thì tin giờ máy; > 2′ từ chối; lùi > 12h thì kẹp.
   - D-065: con số giới hạn thử đăng nhập/PIN/ghép máy.
   - D-067: POS đặt ở `/pos/` cùng tên miền với backoffice (hay subdomain riêng?); backup chép ra ngoài server đi đâu.
   - D-068: máy quầy giữ nhật ký lệnh 7 ngày để khôi phục backup không mất đơn.
3. **Câu hỏi vận hành mới** (backlog cuối `docs/tasks-r1-detailed-task-board.md`): HĐĐT phát hành sau giờ backup; POS có tự tải lại sau khôi phục; `FNB_PAYMENT_SECRET_KEY` bắt buộc ở production?
4. **Giao diện mới:** xem ảnh trước/sau (`~/FileMySelf/FNB-POS/ui-screenshots-2026-10-21/` — `pos-before`, `pos-after`, `backoffice-before`, `backoffice-after`, kèm `design-brief.md` (bản phân tích empos: màu, bố cục, tính năng đáng lấy). Ảnh "trước" dùng dữ liệu XẤU cố ý (tên dài, emoji) nên trông tệ hơn thực tế; "sau" có cả hai loại) và bấm thử — góp ý lúc này rẻ nhất.

## 7. Đề xuất đợt tiếp

Theo thứ tự đề xuất — bạn chọn:

1. **Bạn bấm thử giao diện mới** (`pnpm dev:stack`) + duyệt §6 ⇒ mình sửa theo góp ý. Rẻ nhất, giá trị nhất lúc này.
2. **Review vòng 4** cho phần lớn chưa được review: làn giao diện (104 commit), khôi phục × máy quầy, bàn × 2 máy (~0,5M token).
3. **Mã hàng (SKU) cho món**: nhập Excel đang khớp theo TÊN (đổi tên trong file là thành món mới); thêm cột mã ⇒ khớp như KiotViet/empos + POS tìm món theo mã (~0,4M).
4. **Đặt lên server thật** (cần bạn: một VPS Ubuntu + tên miền) ⇒ chạy hướng dẫn `infra/`, thử TLS/systemd thật, CI tự deploy staging.
5. **App máy quầy + in thật** (cần bạn: máy in nhiệt + cho phép cài Rust/Android SDK) — việc lớn nhất còn lại trước quán thí điểm.
6. **HĐĐT thật + sandbox SePay/PayOS** (cần tài khoản sandbox + kế toán xác nhận luật).
