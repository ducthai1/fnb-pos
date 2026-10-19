# Bản đồ tính năng theo mốc

> Tính năng hướng tới, mỗi cái trỏ về luật (catalog), việc (task) và **file test bảo vệ nó**. Đường dẫn test là dự kiến; khi viết xong thì sửa thành đường dẫn thật.
> Trạng thái: `chưa` · `đang` · `xong` (chỉ khi có file test thật và qua cổng).

## R1 — quán thí điểm (cafe có quầy + bàn) dùng thật

| ID | Tính năng | Catalog | Task | Test bảo vệ (dự kiến) | Trạng thái |
|---|---|---|---|---|---|
| FT-001 | Tenant, chi nhánh, ghép/thu hồi thiết bị | §3 | T01-03, T01-05 | `apps/api/test/integration/tenancy/rls-blocks-cross-tenant-reads.test.ts`, `…/devices/revoked-device-is-rejected.test.ts` | chưa |
| FT-002 | PIN nhân viên, khóa quyền, duyệt tại chỗ, nhật ký | §16 | T01-06…08 | `packages/domain/src/permissions/authorize.test.ts`, `apps/api/test/integration/auth/staff-pin-lockout.test.ts`, `…/auth/manager-approval-is-logged.test.ts` | chưa |
| FT-003 | Cấu hình kế thừa + công tắc có ràng buộc | §2, §21 | T01-09 | `packages/feature-flags/src/validate-flag-constraints.test.ts`, `…/resolve-inherited-config.test.ts` | chưa |
| FT-004 | Menu: món, biến thể, nhóm tùy chọn, combo | §4 | T02-03, T02-04, T03-01…05 | `packages/domain/src/catalog/validate-modifier-selection.test.ts`, `…/resolve-combo.test.ts`, `e2e/backoffice/build-milk-tea-menu.spec.ts` | chưa |
| FT-005 | Giá: theo chi nhánh/kênh/giờ, nhập tay, theo cân | §4 | T02-02, T03-06 | `packages/domain/src/pricing/resolve-price.test.ts` | chưa |
| FT-006 | Hết món bật tay | §4 | T03-08 | `apps/api/test/integration/catalog/manual-86-hides-item-on-pos.test.ts` | chưa |
| FT-007 | Mẫu loại quán | §21 | T03-10 | `packages/shop-templates/src/apply-template-is-idempotent.test.ts` | chưa |
| FT-008 | Nhập/xuất menu Excel | §4 | T03-11 | `apps/api/test/integration/catalog/menu-excel-roundtrip.test.ts` | chưa |
| FT-009 | Bán tại quầy: chọn món, tùy chọn, ghi chú, giữ đơn | §5 | T04-06 | `apps/pos/src/features/order/modifier-picker.test.tsx`, `e2e/pos/counter-sale-cash.spec.ts` | chưa |
| FT-010 | Tổng tiền: thuế/phí theo kênh, làm tròn, giảm giá tay | §8 | T02-05…07, T04-07 | `packages/domain/src/totals/compute-order-totals.test.ts`, `…/totals/order-totals.property.test.ts`, `…/totals/allocate-discount.test.ts` | chưa |
| FT-011 | Thanh toán nhiều phương thức, tiền thừa | §8 | T04-08 | `e2e/pos/split-tender-cash-and-qr.spec.ts` | chưa |
| FT-012 | Số đơn 3 lớp + số gọi món | §5 | T04-09 | `packages/domain/src/order/order-numbering.test.ts`, `packages/sync-client/test/scenarios/offline-orders-get-unique-numbers.test.ts` | chưa |
| FT-013 | Phiếu pha chế theo trạm (gửi theo lượt, hủy) | §7 | T04-10 | `packages/domain/src/kitchen/kitchen-ticket-diff.test.ts` | chưa |
| FT-014 | In bill, tem ly, phiếu pha chế, chốt ca | §11 | T04-11…13 | `packages/printing/src/templates/*.test.ts` + `__golden__/`, `e2e/hardware-checklist.md` | chưa |
| FT-015 | Hàng đợi in, in lại, báo lỗi in | §11 | T04-15 | `apps/pos/src/features/printing/print-queue-retries-and-surfaces-failures.test.ts` | chưa |
| FT-016 | Ca & két: mở, thu/chi, đóng, chuyển đơn mở sang ca sau | §10 | T04-16 | `packages/domain/src/shift/expected-cash.test.ts`, `apps/api/test/integration/shift/close-with-difference-needs-approval.test.ts`, `…/shift/open-orders-carry-to-next-shift.test.ts` | chưa |
| FT-017 | Hủy món trước/sau khi gửi + duyệt | §9 | T02-09, T04-17 | `packages/domain/src/order/void-line.test.ts`, `e2e/pos/void-after-sent-needs-approval.spec.ts` | chưa |
| FT-018 | Hoàn đơn đã trả (đơn hoàn, restock) | §9 | T02-09, T04-17 | `packages/domain/src/order/build-refund.test.ts` | chưa |
| FT-019 | Offline: bán, khóa thao tác, badge, màn "cần xử lý" | §20 | T04-02…04, T04-18 | `packages/sync-client/test/scenarios/{offline-sale-then-sync,duplicate-command-is-noop,out-of-order-commands,continue-on-previous-state,domain-version-mismatch-is-rejected}.test.ts`, `e2e/pos/offline-counter-sale.spec.ts` | chưa |
| FT-020 | Bàn cơ bản: sơ đồ, mở bàn, nhiều lượt, tạm tính, trả sau | §6 | T4B-01…05 | `e2e/pos/table-two-rounds-pay-later.spec.ts` | chưa |
| FT-021 | Chuyển sang bàn trống | §6 | T4B-06 | `packages/domain/src/table/transfer-to-empty-table.test.ts` | chưa |
| FT-022 | Đơn gọi ở quầy kèm số bàn (mang ra bàn) | §5 | T4B-07 | `e2e/pos/counter-order-with-table-tag.spec.ts` | chưa |
| FT-023 | Một đơn mở mỗi bàn + báo xung đột | §6, §20 | T4B-08 | `packages/sync-client/test/scenarios/two-devices-edit-same-table.test.ts` | chưa |
| FT-024 | VietQR động, tự xác nhận, khớp tay | §8 | T05-01…04 | `packages/domain/src/payment/vietqr-payload-crc.test.ts`, `apps/api/test/integration/payments/{webhook-is-idempotent,match-under-over-duplicate}.test.ts` | chưa |
| FT-025 | Hóa đơn điện tử: mỗi lần bán, hàng đợi, gửi cuối ngày | §18 | T05-05…10 | `apps/api/test/integration/einvoice/{one-invoice-per-payment,queued-while-offline,daily-batch-submission}.test.ts` | chưa |
| FT-026 | Thông tin người mua khi khách yêu cầu | §18 | T05-08 | `e2e/pos/invoice-with-buyer-tax-code.spec.ts` | chưa |
| FT-027 | Ngày kinh doanh + chốt ngày | §2, §17 | T02-10, T05-11 | `packages/domain/src/time/business-date.test.ts`, `apps/api/test/integration/day-close/end-of-day-close.test.ts` | chưa |
| FT-028 | Báo cáo cơ bản (định nghĩa doanh thu cố định) | §17 | T05-12 | `apps/api/test/integration/reports/revenue-definitions.test.ts` | chưa |
| FT-029 | Vận hành: giám sát, backup, staging, cập nhật app | — | T11-01…05 | `infra/restore-drill.md` (diễn tập ghi kết quả) | chưa |

## R2 — quán có bàn đầy đủ + kho

| ID | Tính năng | Catalog | Phase |
|---|---|---|---|
| FT-101 | Chia bill (đơn con lưu DB) | §8 | 06 |
| FT-102 | Gộp bàn, ghép bàn, tách món sang bàn khác | §6 | 06 |
| FT-103 | Giữ món, course | §7 | 06 |
| FT-104 | Màn hình bếp (KDS) | §7 | 06 |
| FT-105 | Phục vụ order bằng điện thoại + máy trạm in (**kéo vào R1 nếu quán thí điểm có order tại bàn**) | §7 | 06 |
| FT-106 | Đặt bàn cơ bản | §6 | 06 |
| FT-107 | Máy chính trong LAN khi mất internet | §20 | 06 |
| FT-110 | Nguyên liệu, đơn vị, quy đổi | §12 | 07 |
| FT-111 | Công thức có phiên bản + delta theo tùy chọn | §12 | 07 |
| FT-112 | Trừ kho theo cấu hình + phiếu kho lỗi | §12 | 07 |
| FT-113 | Bán thành phẩm + phiếu sản xuất | §12 | 07 |
| FT-114 | Nhập hàng, nhà cung cấp, trả hàng, công nợ | §12 | 07 |
| FT-115 | Kiểm kê (mốc ghi đè), phiếu hủy | §12 | 07 |
| FT-116 | Giá vốn bình quân, lãi gộp theo món | §13 | 07 |
| FT-117 | Tồn âm + tự báo hết món | §12 | 07 |
| FT-118 | Lô + hạn dùng | §12 | 07 |

## R3 — khách hàng, chuỗi, kênh

| ID | Tính năng | Phase |
|---|---|---|
| FT-201 | Khách hàng | 08 |
| FT-202 | Engine khuyến mãi (cộng dồn tường minh) | 08 |
| FT-203 | Voucher | 08 |
| FT-204 | Tích điểm, đổi điểm, hạng | 08 |
| FT-205 | Thẻ trả trước / ví | 08 |
| FT-210 | Menu trung tâm, ghi đè chi nhánh, đẩy menu có lịch | 09 |
| FT-211 | Chuyển kho | 09 |
| FT-212 | Bếp trung tâm, đặt hàng nội bộ | 09 |
| FT-213 | Báo cáo hợp nhất | 09 |
| FT-220 | QR tại quầy trả trước | 10 |
| FT-221 | QR tại bàn trả sau | 10 |
| FT-222 | Kênh giao hàng nhập tay + đối soát | 10 |
| FT-223 | GrabFood API | 10 |

## R4 — mở bán SaaS

| ID | Tính năng | Phase |
|---|---|---|
| FT-301 | Tự đăng ký + onboarding theo loại quán | 11 |
| FT-302 | Gói cước, dùng thử, thu phí, khóa mềm | 11 |
| FT-303 | Quản trị nội bộ + quyền hỗ trợ có đồng ý | 11 |
| FT-304 | Xuất/xóa dữ liệu tenant | 11 |

Task chi tiết cho R2–R4 viết khi bắt đầu mốc đó (để không viết trước những thứ sẽ đổi sau R1).
