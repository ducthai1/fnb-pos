# Sổ quyết định

> Mỗi quyết định một dòng. **Đã duyệt = khóa**: phiên sau không tự đảo, kể cả khi review/audit bảo khác. Muốn đổi phải có dữ liệu mới, hỏi user, rồi thêm dòng mới ghi "thay D-xxx" (không sửa dòng cũ).
> Trạng thái: `đề xuất` (Claude đưa ra, chưa ai duyệt) · `đã duyệt` (user chốt) · `đã thay` (có dòng mới thay).

| ID | Ngày | Quyết định | Lý do ngắn | Trạng thái | Ai chốt / nguồn |
|---|---|---|---|---|---|
| D-001 | 2026-10-19 | Làm SaaS nhiều quán, chạy thử ở 1 quán | — | đã duyệt | user |
| D-002 | 2026-10-19 | Quầy chạy trên Windows, tablet Android, iPad, điện thoại; bán được cả online và offline | — | đã duyệt | user |
| D-003 | 2026-10-19 | TypeScript mọi tầng; React SPA trong Tauri (Windows) / Capacitor (Android, iOS) / trình duyệt; Node + Fastify + Postgres; Next.js cho backoffice | engine tính tiền chạy chung máy quầy + server | đã duyệt | user duyệt [architecture](architecture-and-stack-decision.md) |
| D-004 | 2026-10-19 | Chia mốc R1 → R4 như [plan](plan.md) | — | đã duyệt | user |
| D-005 | 2026-10-19 | Quán thí điểm: cafe có cả quầy và bàn ⇒ R1 gồm bàn cơ bản (phase 04b); chia/gộp bàn, màn hình bếp để R2 | — | đã duyệt | user |
| D-006 | 2026-10-19 | Claude là người viết code qua nhiều phiên ⇒ docs, rule, bảng task, test phải đủ để phiên mới làm tiếp không cần hỏi lại | — | đã duyệt | user |
| D-007 | 2026-10-19 | Tiền là số nguyên đồng; ID là UUIDv7 tạo ở máy; chứng từ đã chốt bất biến | [catalog §2](logic-catalog-flows-rules-and-design-decisions.md) | đề xuất | Claude |
| D-008 | 2026-10-19 | Đồng bộ tự làm: kéo theo cursor + hàng đợi lệnh idempotent, server tính lại | [architecture §5](architecture-and-stack-decision.md) | đề xuất (khóa sau spike S2) | Claude |
| D-009 | 2026-10-19 | Giữ nhóm tùy chọn min/max (không theo đề xuất bỏ của research E) | API VN chỉ lộ hóa đơn, không lộ cấu hình menu | đề xuất | Claude |
| D-010 | 2026-10-19 | Mặc định: trừ kho khi thanh toán; cho phép tồn âm + cảnh báo; giá vốn bình quân gia quyền | [catalog §12, §13](logic-catalog-flows-rules-and-design-decisions.md) | đề xuất | Claude |
| D-011 | 2026-10-19 | Mặc định khuyến mãi không cộng dồn, chọn cái có lợi nhất cho khách; `stackable` mới cộng | [catalog §14](logic-catalog-flows-rules-and-design-decisions.md) | đề xuất — chờ chủ quán | Claude |
| D-012 | 2026-10-19 | Điểm tính trên tiền thực trả, làm tròn xuống số nguyên; hoàn đơn sinh bút toán điểm âm | [catalog §15](logic-catalog-flows-rules-and-design-decisions.md) | đề xuất — chờ chủ quán | Claude |
| D-013 | 2026-10-19 | Cho đóng ca khi còn bàn mở: chuyển đơn mở sang ca sau | Odoo chặn ⇒ phiền quán mở khuya | đề xuất | Claude |
| D-014 | 2026-10-19 | Test là một phần của tính năng: "có test" = gỡ hành vi ra thì test đỏ; sửa bug bắt đầu bằng test tái hiện | D-006 | đề xuất | Claude, theo yêu cầu user |
| D-015 | 2026-10-20 | Repo: `~/FileMySelf/FNB-POS/fnb-pos`, remote `github.com/ducthai1/fnb-pos`; docs/plan/bảng task nằm trong `docs/` của repo, commit cùng code | docs không lệch code | đã duyệt | user |
| D-016 | 2026-10-20 | Khóa công cụ ở major đã biết: TS 5.9, Vitest 3.2, ESLint 9, pnpm 10, Turborepo 2 (dù đã có TS 7, Vitest 5, ESLint 10) | tránh thay đổi chưa kiểm; nâng cấp là task riêng | đề xuất | Claude |
