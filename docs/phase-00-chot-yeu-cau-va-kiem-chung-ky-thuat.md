# Phase 00 — Chốt yêu cầu & kiểm chứng kỹ thuật

## Context links
- [logic-catalog §23 câu hỏi mở, §24 chưa kiểm chứng](logic-catalog-flows-rules-and-design-decisions.md)
- [architecture — các mục SPIKE](architecture-and-stack-decision.md)

## Overview
- Ưu tiên: **P0 — chặn mọi phase sau.** Trạng thái: chưa bắt đầu. Ước lượng: 2–3 tuần-người.
- Mục tiêu: trả lời những câu mà nếu sai thì phải đập lại kiến trúc: in ấn, DB cục bộ, hóa đơn từ máy tính tiền khi offline, luật nghiệp vụ VN.

## Key insights
- Tài liệu công khai của KiotViet/Sapo FnB/CukCuk/iPOS không có flow F&B dạng chữ ⇒ phải dùng thử thật.
- Phần pháp lý hóa đơn điện tử đang dựa trên blog ⇒ phải có kế toán thuế xác nhận.
- Máy in tem dán ly thường dùng TSPL; ESC/POS chưa chắc dùng được.

- Task chi tiết: [T00-01…11](tasks-r1-detailed-task-board.md). Mẫu hồ sơ quán: [research/pilot-cafe-profile.md](research/pilot-cafe-profile.md).

## Requirements
- Hồ sơ **quán thí điểm** (đã chốt loại: cafe có quầy + bàn; còn thiếu: số máy, máy in đang có, phần mềm đang dùng, nhà cung cấp hóa đơn).
- Trả lời §23 câu 7–15 của catalog.
- 4 spike có kết quả đo được, không phải ý kiến.

## Architecture (các spike)
| Spike | Câu hỏi | Đạt khi |
|---|---|---|
| S1 In | Từ Tauri (Windows) và Capacitor (Android) in được bill ESC/POS qua LAN, Bluetooth, USB; in tem TSPL; mở két; máy Sunmi/iMin in tích hợp | in đúng tiếng Việt có dấu trên ≥ 2 dòng máy in phổ biến; thời gian từ bấm tới ra giấy < 1,5s |
| S2 DB cục bộ + sync | SQLite native (Tauri, Capacitor) + SQLite WASM/OPFS (Safari iOS, Chrome Android) cùng một interface; outbox + kéo theo cursor | 2.000 đơn offline, rút mạng/cắm lại 20 lần, không mất/trùng đơn; chạy tiếp trên dữ liệu lần trước (không reset) |
| S3 VietQR + webhook | sinh QR động trên máy, nhận webhook SePay hoặc PayOS sandbox, khớp theo mã đơn | khớp đúng 100% ca thường; ca chuyển thiếu/thừa/sai nội dung vào màn khớp tay |
| S4 Hóa đơn điện tử | sandbox 1 nhà cung cấp (theo quán thí điểm): tạo HĐ từ máy tính tiền, lấy mã, gửi cuối ngày | biết chắc: mã có sinh được khi offline không, giờ chốt cuối ngày, cách xử lý hoàn tiền |

## Related code files
- Tạo repo mới (tên đề xuất `fnb-pos`), monorepo trống + 4 thư mục spike (xóa sau phase 00).
- Đăng ký repo vào `repos/registry.json` + `sources/<key>.md` của kho kiến thức.

## Implementation steps
1. User đăng ký dùng thử KiotViet FnB và CukCuk (rồi Sapo FnB nếu kịp); Claude điều khiển Chrome đi qua: tạo món + topping + combo, bàn, gửi bếp, chia/gộp bàn, hủy món, ca, kiểm kê, khuyến mãi, phân quyền. Ghi vào `research/research-g-dung-thu-kiotviet-cukcuk.md`.
2. Phỏng vấn quán thí điểm (chủ + thu ngân + pha chế): 1 ngày làm việc của họ, giờ cao điểm, lỗi hay gặp, 10 thao tác dùng nhiều nhất.
3. Gặp kế toán thuế: §23 câu 12–15.
4. Chạy S1–S4, mỗi spike một báo cáo ngắn có số đo.
5. Cập nhật catalog + kiến trúc theo kết quả; chốt phạm vi R1.

## Todo list
- [ ] Chọn quán thí điểm + liệt kê thiết bị thật
- [ ] Dùng thử KiotViet FnB, CukCuk
- [ ] Phỏng vấn quán thí điểm
- [ ] Hỏi kế toán thuế
- [ ] S1 in · S2 DB + sync · S3 VietQR · S4 hóa đơn điện tử
- [ ] Cập nhật catalog/kiến trúc, chốt phạm vi R1

## Success criteria
- Không còn [SPIKE] nào chưa có số đo; mọi câu §23 có người trả lời hoặc có quyết định ghi rõ.

## Risk assessment
- Spike S1 thất bại với Tauri ⇒ chuyển Electron cho Windows (UI giữ nguyên).
- S2 cho thấy SQLite WASM trên iOS không ổn ⇒ iPad bắt buộc dùng app Capacitor, không chạy trong trình duyệt.
- S4: nhà cung cấp hóa đơn không cho sandbox ⇒ chọn nhà cung cấp khác trước khi vào phase 05.

## Security considerations
- Tài khoản dùng thử của user: chỉ đọc/ghi dữ liệu giả, không nhập dữ liệu thật của quán.

## Next steps
- Phase 01 bắt đầu khi S2 xong (không cần chờ S1/S3/S4, chúng chặn phase 04/05).
