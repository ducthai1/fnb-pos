# Quy trình làm việc cho mỗi phiên Claude

> Dự án này do Claude viết code qua nhiều phiên (D-006). File này là "sổ tay ca làm": phiên mới đọc xong là biết làm gì tiếp, làm thế nào, xong thì ghi lại ở đâu.

## 1. Đầu phiên — đọc theo thứ tự (≈ 10 phút)

1. [docs-index-and-reading-order.md](docs-index-and-reading-order.md) — bản đồ tài liệu.
2. [tasks-r1-detailed-task-board.md](tasks-r1-detailed-task-board.md) — mục **Bàn giao phiên trước** ở đầu file, rồi task đang `doing`.
3. [decision-log.md](decision-log.md) — quyết định nào đã khóa.
4. [code-structure-and-conventions.md](code-structure-and-conventions.md) — bản đồ code + ranh giới module.
5. Phần của [catalog](logic-catalog-flows-rules-and-design-decisions.md) mà task trỏ tới. Không đọc cả catalog nếu không cần.
6. `git log --oneline -20` + `git status` của repo code.

## 2. Chọn việc

- Còn task `doing` ⇒ làm tiếp nó.
- Không có ⇒ task `todo` đầu tiên (theo thứ tự trong bảng) mà mọi task phụ thuộc đã `done`.
- Task ghi "việc của user" ⇒ không tự làm; nhắc user, rồi chọn task khác.
- Báo cho user một dòng: đang làm task nào, xong khi nào thì coi là xong.

## 3. Làm

1. Đánh dấu task `doing` + ngày.
2. Đọc code liên quan trước khi sửa.
3. Domain/luật: **viết test trước** (đỏ), rồi code (xanh). UI: viết code, rồi test component/E2E ngay trong cùng đợt.
4. Gặp chỗ mơ hồ về nghiệp vụ ⇒ hỏi user, đừng đoán. Gặp việc mới ngoài task ⇒ thêm vào mục **Backlog phát sinh** của bảng task, đừng làm luôn.
5. Muốn đổi một quyết định `đã duyệt` ⇒ dừng, trình user: quyết định cũ, dữ liệu mới, đánh đổi, hỏi giữ/đổi.

## 4. Xong — Definition of Done (đủ hết mới là `done`)

- [ ] Mọi luật của task có test; gỡ hành vi ra thì test đỏ (thử ít nhất một lần cho luật quan trọng).
- [ ] `pnpm verify` qua (exit code 0); `test:api` / `test:sync` / `e2e` qua nếu task đụng tới.
- [ ] UI mới: test với dữ liệu xấu ở 360px và 800px.
- [ ] Không còn TODO/FIXME mới trong code mà không có dòng tương ứng trong Backlog.
- [ ] Cập nhật: trạng thái task + ghi chú; [feature-map](feature-map-by-release.md) (trạng thái, file test thật); bản đồ code nếu thêm module; catalog + decision-log nếu luật đổi.
- [ ] Commit conventional tiếng Anh, kèm test, chỉ đúng file của task.

## 5. Cuối phiên — bàn giao

Ghi vào mục **Bàn giao phiên trước** ở đầu bảng task (ghi đè bản cũ):
- Ngày; task vừa làm; trạng thái.
- Đang dở ở đâu (file, hàm, test đang đỏ nếu có).
- Bước tiếp theo cụ thể.
- Câu hỏi đang chờ user.

## 6. Cấm

- Tự tính tiền ngoài `packages/domain`.
- Xóa/skip test để qua cổng.
- Ghi mã task/phase/quyết định vào code, test, migration, commit.
- Sửa chứng từ đã chốt thay vì tạo chứng từ đảo.
- Đổi quyết định `đã duyệt` mà không hỏi.
- Spawn subagent/workflow mà chưa xin user kèm ước tính (luật token của workspace).
