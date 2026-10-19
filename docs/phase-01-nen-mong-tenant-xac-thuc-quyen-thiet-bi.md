# Phase 01 — Nền móng: tenant, xác thực, quyền, thiết bị, cấu hình

## Context links
- [catalog §2 nguyên tắc, §3 tổ chức, §16 quyền, §21 công tắc](logic-catalog-flows-rules-and-design-decisions.md)
- [architecture §3 stack, §4 quy ước, §8 bảo mật](architecture-and-stack-decision.md)

## Overview
- Ưu tiên: P0. Phụ thuộc: phase 00 (S2). Ước lượng: 3–4 tuần-người.
- Dựng khung để mọi phase sau chỉ thêm nghiệp vụ, không sửa móng.

## Key insights
- Odoo chỉ ghi nhân viên ở cấp đơn và bị ghi đè; Square dùng mã chung ⇒ mất dấu vết. Ở đây ghi người làm trên mọi thao tác ngay từ đầu.
- Công tắc tính năng có ràng buộc phụ thuộc/loại trừ (Toast) ⇒ danh mục công tắc là code có kiểm tra, không phải bảng tự do.

## Requirements
- Functional:
  - Tổ chức → thương hiệu → chi nhánh → khu vực/bàn (khung) → thiết bị.
  - Đăng nhập backoffice (SĐT/email + mật khẩu + OTP).
  - Ghép thiết bị bằng mã một lần; thu hồi thiết bị.
  - PIN nhân viên trên thiết bị đã ghép.
  - Vai trò mẫu + khóa quyền + ngưỡng; duyệt tại chỗ bằng PIN người có quyền.
  - Nhật ký thao tác; `approval_log`.
  - Cấu hình kế thừa hệ thống → thương hiệu → chi nhánh → thiết bị; danh mục công tắc có ràng buộc.
- Non-functional: RLS theo tenant; mọi bảng có `tenant_id`, `version`, `created_by`; UUIDv7; tiền số nguyên.

## Architecture
- `apps/api`: Fastify, plugin auth (session backoffice, device token, staff PIN session ngắn hạn).
- `packages/db`: schema `organization, brand, branch, area, table, device, user, staff, role, permission, role_permission, staff_branch_role, approval_log, audit_log, config_value(scope_type, scope_id, key, value)`.
- `packages/feature-flags`: khai báo `{key, default, requires[], excludes[], scope}`; hàm `validate(flags)` dùng ở cả backoffice và API.
- RLS: `SET app.tenant_id` mỗi request; policy trên mọi bảng.

## Related code files
- Tạo: `apps/api/*`, `packages/db/schema/{tenancy,auth,staff,config,audit}.ts`, `packages/feature-flags/*`, `packages/contracts/{auth,device}.ts`, `apps/backoffice` (khung: đăng nhập, chi nhánh, nhân viên, vai trò, thiết bị).

## Implementation steps
1. Monorepo, CI (tsc, lint, test, build), môi trường dev với Postgres thật (docker compose).
2. Schema tenancy + RLS + test âm chéo tenant.
3. Auth backoffice; ghép thiết bị; PIN nhân viên (giới hạn thử, khóa tạm).
4. Quyền: danh mục khóa quyền, vai trò mẫu (chủ, quản lý, thu ngân, phục vụ, pha chế/bếp, thủ kho), API `authorize(action, ctx)` trả `allowed | needs_approval | denied`.
5. Duyệt tại chỗ: luồng nhập PIN người duyệt → ghi `approval_log`.
6. Cấu hình kế thừa + công tắc có ràng buộc.
7. Backoffice khung cho các mục trên.

## Todo list
- [ ] Monorepo + CI + docker Postgres
- [ ] Schema tenancy + RLS + test chéo tenant
- [ ] Auth backoffice, ghép thiết bị, PIN
- [ ] Khóa quyền + vai trò mẫu + `authorize()`
- [ ] Duyệt tại chỗ + approval_log + audit_log
- [ ] Cấu hình kế thừa + feature-flags có ràng buộc
- [ ] Backoffice khung

## Success criteria
- Test chéo tenant đỏ nếu bỏ RLS (test có ý nghĩa, gỡ hành vi là đỏ).
- Thu hồi thiết bị ⇒ request kế tiếp của máy đó bị từ chối.
- Bật công tắc vi phạm ràng buộc ⇒ bị chặn kèm lý do.

## Risk assessment
- RLS làm chậm truy vấn ⇒ index `(tenant_id, …)` mọi bảng lớn; đo sớm.
- Thiết kế quyền quá chi tiết ⇒ bắt đầu ~15 khóa quyền của catalog §16, thêm khi cần.

## Security considerations
- PIN: không gửi băm xuống máy; xác thực PIN ở server khi online, khi offline dùng bản băm có salt + giới hạn thử lưu trong kho bảo mật của vỏ native.
- Token thiết bị lưu trong keychain/keystore của vỏ native.

## Next steps
- Phase 02 chạy song song được từ bước 2.
