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
| D-017 | 2026-10-20 | Postgres **17** (không phải 16); test dùng `embedded-postgres` 17.10, không Docker | máy không có quyền Docker; chạy ~0,3s, RLS đúng | đề xuất (đã kiểm) | Claude |
| D-018 | 2026-10-20 | Migration là SQL viết tay + runner nhỏ (khóa advisory, checksum, 1 transaction/file); Drizzle chỉ mô tả cột để query có kiểu | drizzle-kit không biểu diễn FORCE RLS, policy, khóa ngoại kép | đề xuất | agent api-foundation |
| D-019 | 2026-10-20 | Role `fnb_owner` (chạy migration, không superuser nên FORCE RLS ràng buộc được) + `fnb_app` (chỉ DML, không TRUNCATE); mọi bảng tenant có UNIQUE (tenant_id, id) + khóa ngoại kép (tenant_id, parent_id) | kiểm FK bỏ qua RLS; TRUNCATE bỏ qua RLS | đề xuất | agent api-foundation |
| D-020 | 2026-10-20 | Dòng con (topping, thành phần combo, giảm giá dòng) có quantity tính trên MỘT đơn vị dòng cha; effectiveQuantity = tích dọc đường lên gốc | giống Toast/Square | đề xuất | Claude |
| D-021 | 2026-10-20 | Đồng bộ (bổ sung D-008, đã đo ở spike S2): lệnh của một máy phải tới đúng thứ tự `device_seq` (cao hơn ⇒ retry); `applied_command` lưu cả kết quả bị từ chối; khóa advisory theo tenant giữ từ lúc lấy `change_seq` tới COMMIT; `change_log` lưu ảnh chụp hàng đầy đủ; tiền/số lượng đi trên mạng dạng chuỗi thập phân | 0 mất/0 trùng dưới lỗi mạng | đề xuất (spike xác nhận) | agent spike + Claude |
| D-022 | 2026-10-20 | Giá: khung giờ qua nửa đêm thuộc ngày bắt đầu (T6 22:00–02:00 vẫn bật lúc 01:00 T7); `percent_off` làm tròn **giá cuối**; kiểm MỌI item bảng giá (một item lỗi chặn tính giá); `enteredPrice` chỉ cho món giá mở | — | **chờ user** | agent domain-catalog |
| D-023 | 2026-10-20 | Máy quầy: SQLite WAL + `synchronous=FULL` (~1,2–1,6 ms/đơn, không mất đơn khi mất điện) thay vì NORMAL (~0,05 ms, có thể mất vài đơn cuối) | an toàn hơn tốc độ | **chờ user** | spike S2 |
| D-024 | 2026-10-20 | POS chạy trong trình duyệt (PWA): SQLite WASM opfs-sahpool chỉ cho 1 tab ⇒ khóa 1 tab bằng Web Locks; Safari có thể xóa dữ liệu chưa đồng bộ ⇒ iPad dùng app Capacitor, PWA chỉ cho điện thoại order (online) | — | **chờ user** | spike S2 |
