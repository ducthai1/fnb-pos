# fnb-pos — hệ thống quản lý quán F&B đa loại hình (SaaS)

Code do Claude viết qua nhiều phiên. **Trước khi làm bất cứ gì: đọc [`docs/docs-index-and-reading-order.md`](docs/docs-index-and-reading-order.md)** rồi làm theo [`docs/development-workflow-for-claude-sessions.md`](docs/development-workflow-for-claude-sessions.md). Việc cần làm + bàn giao phiên trước nằm ở [`docs/tasks-r1-detailed-task-board.md`](docs/tasks-r1-detailed-task-board.md).

## Luật cứng (chi tiết trong docs)

1. Tính tiền **chỉ** trong `packages/domain` (thuần: không I/O, không đồng hồ, không random — eslint chặn). UI, API, sync gọi nó, không tự cộng trừ.
2. Tiền là số nguyên đồng (`bigint`), không float. ID là UUIDv7 tạo nơi sinh bản ghi.
3. Chứng từ đã chốt (đơn đã trả, phiếu kho, hóa đơn) bất biến; sửa = chứng từ đảo.
4. Server không tin tiền client gửi: tính lại bằng `domain`.
5. **Test là một phần của tính năng**: gỡ hành vi ra thì test phải đỏ; sửa bug bắt đầu bằng test tái hiện. Không xóa/skip test để qua cổng.
6. Không ghi mã task / phase / quyết định (`T04-07`, `D-010`…) vào code, test, migration, commit.
7. Quyết định `đã duyệt` trong `docs/decision-log.md` không tự đảo — hỏi user.
8. Việc nảy ra ngoài task ⇒ ghi "Backlog phát sinh", không làm luôn. Cuối phiên ghi "Bàn giao phiên trước".
9. Code, comment, commit, tên test: tiếng Anh. Docs và chuỗi hiển thị: tiếng Việt.

## Lệnh

```
pnpm install
pnpm verify        # typecheck + eslint (0 warning) + unit test — chạy trước mỗi commit, kiểm bằng exit code
```
Các cổng khác (`test:api`, `test:sync`, `e2e`, `build`) thêm dần theo phase — xem `docs/testing-strategy-and-test-file-layout.md`.

## Công cụ đang khóa phiên bản

pnpm 10.34.7 · TypeScript 5.9.3 · Vitest 3.2.7 · ESLint 9.39.5 · Turborepo 2.11.9 · Node ≥ 22. Đã có bản major mới hơn (TS 7, Vitest 5, ESLint 10); nâng cấp là một task riêng, không tiện tay nâng.
