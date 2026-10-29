# Bản đồ tính năng theo mốc

> Tính năng hướng tới, mỗi cái trỏ về luật (catalog), việc (task) và **file test bảo vệ nó**. Đường dẫn test là file thật; dòng còn "(dự kiến)" là test chưa viết.
> Trạng thái: `chưa` · `đang` · `xong` (chỉ khi có file test thật và qua cổng).

## R1 — quán thí điểm (cafe có quầy + bàn) dùng thật

| ID | Tính năng | Catalog | Task | Test bảo vệ | Trạng thái |
|---|---|---|---|---|---|
| FT-001 | Tenant, chi nhánh, ghép/thu hồi thiết bị | §3 | T01-03, T01-05 | `apps/api/test/integration/tenancy/rls-blocks-cross-tenant-reads.test.ts`, `apps/api/test/integration/tenancy/row-level-security-binds-the-owner-role.test.ts`, `apps/api/test/integration/devices/revoked-device-is-rejected.test.ts`, `apps/api/test/integration/devices/pairing-code-single-use.test.ts`, `e2e/backoffice/pair-a-device.spec.ts` | xong |
| FT-002 | PIN nhân viên, khóa quyền, duyệt tại chỗ, nhật ký | §16 | T01-06…08 | `packages/domain/src/permissions/authorize.test.ts`, `apps/api/test/integration/auth/parallel-pin-attempts-are-counted-exactly.test.ts`, `apps/api/test/integration/auth/manager-approval-is-logged.test.ts`, `apps/api/test/integration/auth/on-the-spot-approval.test.ts`, `apps/api/test/integration/auth/backoffice-routes-require-their-permission.test.ts` | xong |
| FT-003 | Cấu hình kế thừa + công tắc có ràng buộc | §2, §21 | T01-09 | `packages/feature-flags/src/validate-flag-constraints.test.ts`, `…/resolve-inherited-config.test.ts`, `e2e/backoffice/settings-and-day-close.spec.ts` | đang — lưu, ràng buộc, kế thừa và trang Cài đặt xong; 11/13 công tắc chưa có tác dụng ở máy quầy (sổ tay `discrepancies.md` B1, Q13) |
| FT-004 | Menu: món, biến thể, nhóm tùy chọn, combo | §4 | T02-03, T02-04, T03-01…05 | `packages/domain/src/catalog/{validate-modifier-group-config,validate-modifier-selection,validate-modifier-selection-limits,resolve-combo,resolve-combo-picks,validate-combo-config}.test.ts`, `packages/domain/src/kitchen/diff-kitchen-ticket-combo.test.ts`, `apps/api/test/integration/catalog/catalog-crud.test.ts`, `apps/api/test/integration/catalog/catalog-combo-product.test.ts`, `apps/api/test/integration/sync/sync-save-draft-sells-combos.test.ts`, `apps/backoffice/src/components/menu/product-editor/product-editor-combo.test.tsx`, `apps/pos/src/screens/sale/combo-picker-screen.test.tsx`, `apps/pos/src/features/order/combo-cart-line.test.ts`, `e2e/backoffice/build-milk-tea-menu.spec.ts` | xong (2026-10-28) — món, biến thể, nhóm tùy chọn, combo (trang quản lý + API + máy quầy, phiếu bếp theo trạm từng món; D-113…D-116); còn thiếu e2e combo (Backlog) |
| FT-005 | Giá: theo chi nhánh/kênh/giờ, nhập tay, theo cân | §4 | T02-02, T03-06, T04-07 | `packages/domain/src/pricing/{resolve-price,price-list-precedence,price-list-schedule,validate-price-list-item,weighed-quantity}.test.ts`; `apps/pos/src/app/counter-typed-price-and-weight.test.tsx`; `apps/api/test/integration/sync/sync-save-draft-{open-price-needs-the-permission,prices-weighed-lines-by-weight}.test.ts`; `apps/api/test/integration/catalog/price-list-list-and-delete.test.ts`; `apps/backoffice/src/components/menu/price-lists/*.test.tsx`; `e2e/backoffice/happy-hour-price-list.spec.ts` | đang — domain xong; máy quầy bán giá nhập tay (duyệt gắn đúng món + giá) và theo cân (kg / 100 g, nhập gam); trang Bảng giá (danh sách, sửa quy tắc, xóa) đã có; chưa có kênh bán, nhóm khách, số lượng tối thiểu |
| FT-006 | Hết món bật tay | §4 | T03-08 | `apps/api/test/integration/catalog/manual-86-availability.test.ts` | xong — trang Hết món ở trang quản lý |
| FT-007 | Mẫu loại quán | §21 | T03-10 | `packages/shop-templates/src/{apply-template-is-idempotent,plan-template}.test.ts`, `apps/api/test/integration/shop-templates/apply-shop-template.test.ts`, `apps/backoffice/src/components/shop-templates/shop-templates-screen.test.tsx`, `e2e/backoffice/apply-shop-template.spec.ts` | xong (2026-10-29) — 5 mẫu (danh mục, trạm, công tắc), xem trước rồi áp, chỉ thêm cái còn thiếu (D-119); thiếu các hàng chưa có chỗ chứa ở R1: nhóm tùy chọn mẫu, bán theo mẻ, quy đổi chai → ml, lô + hạn, giờ cắt ngày |
| FT-008 | Nhập/xuất menu Excel | §4 | T03-11 | `apps/backoffice/src/lib/catalog/menu-sheet/read-menu-sheet.test.ts`, `apps/backoffice/src/components/menu/menu-import/`, `e2e/backoffice/import-menu-from-excel.spec.ts` | xong — món giá nhập tay / theo cân chưa đi qua Excel |
| FT-009 | Bán tại quầy: chọn món, tùy chọn, ghi chú, giữ đơn | §5 | T04-06 | `apps/pos/src/screens/sale/modifier-picker-screen.test.tsx`, `apps/pos/src/app/counter-sale.test.tsx`, `e2e/pos/counter-sale-cash.spec.ts` | xong |
| FT-010 | Tổng tiền: thuế/phí theo kênh, làm tròn, giảm giá tay | §8 | T02-05…07, T04-07 | `packages/domain/src/totals/{compute-order-totals,compute-order-totals-with-voids,allocate-amount,cumulative-discount-rate}.test.ts`, `…/totals/order-totals.property.test.ts`, `packages/domain/src/rounding/cash-rounding.test.ts` | xong — trừ làm tròn tiền mặt: domain có, máy quầy chưa dùng |
| FT-011 | Thanh toán nhiều phương thức, tiền thừa | §8 | T04-08 | `apps/pos/src/app/{counter-checkout,counter-payment-drawer,counter-qr-checkout}.test.tsx`, `apps/api/test/integration/payments/qr-short-transfer-finished-at-the-counter.test.ts` | xong theo D-073 — mỗi đơn một cách trả (tiền mặt hoặc QR); ngoại lệ thu nốt QR thiếu bằng tiền mặt / QR thứ hai (D-080) |
| FT-012 | Số đơn 3 lớp + số gọi món | §5 | T04-09 | `apps/pos/src/features/order/device-order-number.test.ts` | đang — số đơn theo máy + số gọi tính trên máy (D-048); số gọi khi chi nhánh có ≥ 2 máy (D-082) chưa |
| FT-013 | Phiếu pha chế theo trạm (gửi theo lượt, hủy) | §7 | T04-10 | `packages/domain/src/kitchen/{diff-kitchen-ticket,diff-kitchen-ticket.property}.test.ts`, `apps/pos/src/features/printing/print-sale-slips.test.ts` | xong |
| FT-014 | In bill, tem ly, phiếu pha chế, chốt ca | §11 | T04-11…13 | `packages/printing/src/templates/{bill,cup-label,kitchen-ticket,shift-close}-template.test.ts`, `e2e/hardware-checklist.md` (chưa có) | đang — mẫu in + xem trước trên bản web; in ra giấy cần vỏ Windows/Android + máy in thật |
| FT-015 | Hàng đợi in, in lại, báo lỗi in | §11 | T04-15 | `apps/api/test/integration/print/print-job-report-is-logged.test.ts`, `apps/api/test/integration/print/print-failures-report-lists-what-never-printed.test.ts` | đang — nhật ký in + trang In lỗi xong; hàng đợi in lại tự động cần vỏ máy quầy |
| FT-016 | Ca & két: mở, thu/chi, đóng, chuyển đơn mở sang ca sau | §10 | T04-16 | `packages/domain/src/shift/expected-cash.test.ts`, `apps/api/test/integration/shift/close-with-difference-needs-approval.test.ts`, `apps/api/test/integration/shift/open-orders-carry-to-next-shift.test.ts`, `e2e/pos/close-shift-with-count.spec.ts` | xong |
| FT-017 | Hủy món trước/sau khi gửi + duyệt | §9 | T02-09, T04-17 | `packages/domain/src/order/void-order-line.test.ts`, `apps/pos/src/app/{counter-void-and-cancel,table-void-after-sent}.test.tsx`, `e2e/pos/void-discount-refund-with-approval.spec.ts` | xong — trên bản web món bàn không bao giờ thành "đã gửi bếp" (chỉ khi máy in nhận phiếu), xem `discrepancies.md` Q16 |
| FT-018 | Hoàn đơn đã trả (đơn hoàn, restock) | §9 | T02-09, T04-17 | `packages/domain/src/order/build-refund-order.test.ts`, `apps/api/test/integration/sync/sync-refund-gives-back-what-the-sale-took.test.ts`, `apps/pos/src/app/refund-from-history.test.tsx` | xong |
| FT-019 | Offline: bán, khóa thao tác, badge, màn "cần xử lý" | §20 | T04-02…04, T04-18 | `packages/sync-client/test/scenarios/{offline-sale-then-sync,duplicate-command-is-noop,out-of-order-commands,continue-on-previous-state,domain-version-mismatch-is-rejected,two-tills-at-peak-converge}.test.ts`, `e2e/pos/offline-counter-sale.spec.ts` | xong — màn "Cần xử lý" chưa có thao tác cho từng lệnh (T04-04) |
| FT-020 | Bàn cơ bản: sơ đồ, mở bàn, nhiều lượt, tạm tính, trả sau | §6 | T4B-01…05 | `e2e/pos/table-service.spec.ts`, `apps/pos/src/app/{table-floor,table-rounds,table-qr-payment}.test.tsx` | xong (2026-10-20) |
| FT-021 | Chuyển sang bàn trống | §6 | T4B-06 | `apps/pos/src/app/table-refusals.test.tsx`, `e2e/pos/table-service.spec.ts` | xong (2026-10-20) |
| FT-022 | Đơn gọi ở quầy kèm số bàn (mang ra bàn) | §5 | T4B-07 | `apps/api/test/integration/tables/counter-order-with-table-tag.test.ts` | xong |
| FT-023 | Một đơn mở mỗi bàn + báo xung đột | §6, §20 | T4B-08 | `apps/api/test/integration/tables/{one-open-order-per-table,two-tills-adding-to-one-table,two-tills-open-one-table-at-once}.test.ts`, `apps/pos/src/app/table-two-tills-add-at-once.test.tsx` | xong |
| FT-024 | VietQR động, tự xác nhận, khớp tay | §8 | T05-01…04 | `packages/domain/src/payment/vietqr-payload-crc.test.ts`, `apps/api/test/integration/payments/{match-under-over-duplicate,manual-match,money-the-bank-brought-is-never-dropped}.test.ts`, `e2e/pos/qr-payment-auto-confirm.spec.ts` | xong |
| FT-025 | Hóa đơn điện tử: mỗi lần bán, hàng đợi, gửi cuối ngày | §18 | T05-05…10 | `apps/api/test/integration/einvoice/{one-invoice-per-payment,queued-while-provider-down,daily-batch-submission}.test.ts` | đang — luồng + hàng đợi chạy với nhà cung cấp giả; nhà cung cấp thật chờ sandbox |
| FT-026 | Thông tin người mua khi khách yêu cầu | §18 | T05-08 | `e2e/pos/invoice-with-buyer-tax-code.spec.ts`, `apps/api/test/integration/einvoice/buyer-info-before-issue.test.ts` | xong |
| FT-027 | Ngày kinh doanh + chốt ngày | §2, §17 | T02-10, T05-11 | `packages/domain/src/time/business-date.test.ts`, `apps/api/test/integration/day-close/end-of-day-close.test.ts`, `e2e/backoffice/settings-and-day-close.spec.ts` | xong |
| FT-028 | Báo cáo cơ bản (định nghĩa doanh thu cố định) | §17 | T05-12 | `apps/api/test/integration/reports/revenue-definitions.test.ts` | xong |
| FT-029 | Vận hành: giám sát, backup, staging, cập nhật app | — | T11-01…05 | `infra/restore-drill.md`, `pnpm test:ops`, `apps/api/test/integration/client-errors/clients-report-their-faults.test.ts` | đang — backup + diễn tập khôi phục xong; thu lỗi máy khách xong; staging, cập nhật app quầy, đóng gói + deploy chưa |

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
