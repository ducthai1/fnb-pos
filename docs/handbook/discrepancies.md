# Chỗ tài liệu cũ và code nói khác nhau

Sổ tay mô tả theo **code + test + câu chữ trên màn hình** (nguồn sự thật). Mỗi dòng dưới đây là một chỗ tài liệu khác (decision-log, logic-catalog, feature-map) hoặc một câu trên màn hình nói khác với điều code làm. Sổ tay **không** sửa code; dòng nào được xử lý thì xóa khỏi đây trong cùng commit sửa.

## Backoffice và vận hành

| # | Tài liệu / màn hình nói | Code làm | Chỗ trong code | Sổ tay ghi theo |
|---|---|---|---|---|
| B1 | `docs/decision-log.md` D-030 và trang Cài đặt trình bày 13 công tắc tính năng như các tính năng bật/tắt được | Chỉ **Quản lý bàn** (`tables`) và **Hủy món đã gửi bếp phải có người duyệt** (`void_after_sent_needs_approval`) được máy quầy đọc. 11 công tắc còn lại (quầy trả trước, in tem ly, chia phiếu theo trạm, ra món theo lượt, gọi món QR, giá theo giờ, tồn kho ×3, hóa đơn điện tử, làm tròn tiền mặt) chỉ được lưu, kiểm ràng buộc và gửi xuống máy, không phần nào làm theo | `apps/pos/src/app/selling-modes.tsx:50`, `apps/pos/src/app/void-line-flow.tsx:15`; danh mục ở `packages/feature-flags/src/feature-flag-catalog.ts:50-75` | Bảng công tắc ghi "chưa có tác dụng" cho 11 công tắc ([09-cai-dat](quan-ly/09-cai-dat.md)) |
| B2 | Công tắc **Hóa đơn điện tử** (`einvoice`) gợi ý nó bật/tắt việc xuất hóa đơn | Việc xuất hóa đơn chỉ theo ô `enabled` của **hồ sơ hóa đơn điện tử** (`einvoice_profile`); công tắc `einvoice` không được đọc ở đâu | `apps/api/src/einvoice/branch-einvoice-profile.ts:47-48`, `apps/api/src/einvoice/queue-einvoice.ts:8` | Ghi rõ hồ sơ hóa đơn quyết định |

## Máy quầy

| # | Tài liệu nói | Code làm | Chỗ trong code |
|---|---|---|---|
| Q13 | `decision-log.md:36` (D-030) và trang quản lý (Cài đặt, "Công tắc tính năng"): có công tắc **In tem ly**, **Quầy trả tiền trước**, **Chia phiếu theo trạm pha chế/bếp**, **Giá theo khung giờ**, **Làm tròn tiền mặt** | Máy quầy và API **không đọc** các công tắc này: tem ly luôn hiện cho món đánh dấu in tem; phiếu bếp luôn chia theo trạm; bảng giá theo giờ luôn áp; không có làm tròn tiền mặt | `apps/pos/src/features/printing/cup-label-slip.ts:23`; `grep` các tên công tắc trong `apps/pos/src`, `apps/api/src` không ra kết quả |
| Q16 | FT-014 / D-045 mô tả in bill, tem, phiếu pha chế | Bản web chỉ **xem trước**; vì món chỉ thành "đã gửi bếp" khi máy in nhận phiếu, ở bản web món bàn **không bao giờ** khóa sau gửi bếp, nên không có hủy-món-cần-duyệt hay phiếu hủy trong thực tế. Đúng thiết kế, nhưng cần biết khi chạy thử quán thật | `apps/pos/src/features/printing/printer-port.ts:24-35`, `apps/pos/src/features/table-order/table-order-rounds.ts:88-117` |
