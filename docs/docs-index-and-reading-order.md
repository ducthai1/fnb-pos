# Bản đồ tài liệu — đọc file này đầu tiên

> Dự án: hệ thống quản lý quán F&B đa loại hình, bán dạng SaaS. Code do Claude viết qua nhiều phiên.
> Mọi tài liệu nằm trong thư mục `docs/` của repo code (`~/FileMySelf/FNB-POS/fnb-pos`, remote `github.com/ducthai1/fnb-pos`) và được commit **cùng** code + test. Kho kiến thức GrowX chỉ giữ hồ sơ trỏ về đây (`sources/fnb-pos.md`).

## Đọc đầu mỗi phiên (theo thứ tự)

| # | File | Để làm gì |
|---|---|---|
| 1 | [development-workflow-for-claude-sessions.md](development-workflow-for-claude-sessions.md) | quy trình một phiên: đọc gì, chọn việc, Definition of Done, bàn giao |
| 2 | [tasks-r1-detailed-task-board.md](tasks-r1-detailed-task-board.md) | **việc cần làm** + bàn giao phiên trước |
| 3 | [decision-log.md](decision-log.md) | quyết định đã khóa — không tự đảo |
| 4 | [code-structure-and-conventions.md](code-structure-and-conventions.md) | bản đồ code, ranh giới module, quy ước |
| 5 | [testing-strategy-and-test-file-layout.md](testing-strategy-and-test-file-layout.md) | test ở đâu, viết thế nào, cổng |

## Tra khi cần

| File | Nội dung |
|---|---|
| [plan.md](plan.md) | tổng quan phase, mốc R1–R4, phụ thuộc |
| `phase-XX-*.md` | yêu cầu, kiến trúc, rủi ro từng phase |
| [feature-map-by-release.md](feature-map-by-release.md) | tính năng hướng tới → luật → task → file test |
| [logic-catalog-flows-rules-and-design-decisions.md](logic-catalog-flows-rules-and-design-decisions.md) | **luật nghiệp vụ** (nguồn thật của mọi hành vi) |
| [architecture-and-stack-decision.md](architecture-and-stack-decision.md) | stack, đồng bộ, in ấn, thanh toán, bảo mật |
| `research/research-a…f-*.md` | bằng chứng từ các hệ thống thật (Toast, Square, Odoo code, CukCuk API…) |
| `research/pilot-cafe-profile.md` | hồ sơ quán thí điểm (T00-01) |
| `research/review-wave-*-findings.md` | các vòng review sâu (1–2, 3–7, 8–9d): phát hiện + kịch bản + cách sửa |
| `reports/progress-report-*.md` | báo cáo tiến độ gửi chủ dự án duyệt (số liệu, mức kiểm chứng, quyết định chờ chốt, kế hoạch đợt tiếp) |

## Khi nào cập nhật file nào

| Sự kiện | Cập nhật |
|---|---|
| Xong một task | bảng task (trạng thái + ghi chú), feature-map (file test thật), bản đồ code nếu thêm module |
| Luật nghiệp vụ đổi | catalog + decision-log (dòng mới) + test tương ứng |
| Quyết định kỹ thuật mới | decision-log; architecture nếu đổi hình dạng hệ thống |
| Cuối phiên | mục "Bàn giao phiên trước" của bảng task |
| Phát hiện việc ngoài task | mục "Backlog phát sinh" của bảng task |
