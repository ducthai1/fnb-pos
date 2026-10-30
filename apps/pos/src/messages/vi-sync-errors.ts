// What the till says when the server refused one of its commands for good; vi.ts merges
// these into `vi.errors`, keyed by the code the server answers with.

export const VI_SYNC_ERRORS = {
  SYNC_ORDER_HAS_SETTLED_QR:
    "Khách đã chuyển khoản đủ qua QR của đơn này, nên máy chủ không nhận thu tiền mặt, hủy đơn hay tạo QR mới. Trả lại tiền mặt cho khách (nếu đã thu) rồi đóng đơn bằng QR đã nhận.",
  SYNC_PAYMENT_INTENT_ID_TAKEN: "Mã QR trùng với một mã đã có của cửa hàng. Tạo QR mới.",
  SYNC_PAYMENT_INTENT_NOT_FOUND: "Máy chủ không tìm thấy mã QR này ở chi nhánh của máy.",
  SYNC_PAYMENT_INTENT_ALREADY_PENDING:
    "Đơn đang có một mã QR chờ chuyển khoản. Hủy mã đó rồi mới tạo mã mới.",
  SYNC_PAYMENT_CONTENT_CODE_TAKEN:
    "Nội dung chuyển khoản trùng với một mã QR trong tuần qua. Tạo QR mới.",
  SYNC_PAYMENT_INTENT_OF_ANOTHER_ORDER: "Mã QR này thuộc đơn khác, không dùng trả đơn này được.",
  SYNC_PAYMENT_INTENT_NOT_PAID: "Ngân hàng chưa báo nhận tiền cho mã QR này.",
  SYNC_PAYMENT_NO_EXCESS_TO_HAND_BACK:
    "Mã QR này không có tiền thừa để thối lại (khách không chuyển thừa, hoặc đơn chưa đóng bằng mã này).",
  SYNC_PAYMENT_EXCESS_AMOUNT_MISMATCH:
    "Số tiền thối lại khác phần thừa ngân hàng báo về. Khoản thừa vẫn nằm trong danh sách cần hoàn ở trang quản lý.",
  SYNC_PAYMENT_INTENT_HANDED_BACK:
    "Tiền của mã QR này đã được quản lý trả lại khách, nên không dùng trả đơn được nữa. Thu cách khác.",
  SYNC_PAYMENT_INTENT_AMOUNT_MISMATCH:
    "Số tiền ghi cho khoản chuyển khoản khác số máy chủ tính cho mã QR (đủ: số của mã; thiếu: số ngân hàng báo về).",
  SYNC_PAYMENTS_DO_NOT_MATCH_AMOUNT_DUE: "Tổng các khoản đã thu khác số tiền cần thu của đơn.",
  SYNC_REFUND_METHOD_NOT_ALLOWED:
    "Đơn này khách không trả bằng chuyển khoản nên chỉ hoàn được bằng tiền mặt từ két.",
  DOMAIN_CATALOG_COMBO_OPTION_NOT_IN_SLOT:
    "Combo vừa đổi trên thực đơn: một món đã chọn không còn trong combo. Xóa combo khỏi đơn rồi chọn lại.",
  DOMAIN_CATALOG_REQUIRED_COMBO_SLOT_MISSING:
    "Combo còn thiếu một phần bắt buộc (thực đơn vừa đổi). Xóa combo khỏi đơn rồi chọn lại.",
  DOMAIN_CATALOG_TOO_MANY_COMBO_SELECTIONS:
    "Combo có nhiều món hơn thực đơn cho phép (thực đơn vừa đổi). Xóa combo khỏi đơn rồi chọn lại.",
  DOMAIN_ORDER_TOTAL_MISMATCH:
    "Tổng tiền trên máy khác tổng máy chủ tính (đơn hoặc giá vừa đổi ở nơi khác). Mở lại đơn để tính lại.",
  DOMAIN_PRICING_ENTERED_PRICE_REQUIRED:
    "Món giá nhập tay chưa có giá. Chạm vào món trong đơn để gõ giá rồi lưu lại.",
  DOMAIN_PRICING_ENTERED_PRICE_TOO_LARGE:
    "Giá gõ vượt 100.000.000 ₫ cho một món nên máy chủ không nhận. Gõ lại giá.",
  DOMAIN_PRICING_ENTERED_PRICE_NOT_ALLOWED:
    "Món này đã có giá trên thực đơn nên không gõ giá được (thực đơn vừa đổi). Xóa món rồi thêm lại.",
  DOMAIN_PRICING_WEIGHT_NOT_POSITIVE: "Món bán theo cân cần cân nặng lớn hơn 0 g. Cân lại món.",
  DOMAIN_PRICING_WEIGHT_NOT_WHOLE_GRAMS:
    "Cân nặng không tròn gam theo đơn vị của món (đơn vị vừa đổi). Cân lại món.",
  DOMAIN_PRICING_QUANTITY_NOT_WHOLE:
    "Món bán theo cái chỉ nhận số lượng nguyên (1, 2, 3…), không nhận số lẻ. Sửa số lượng rồi lưu lại.",
  DOMAIN_PRICING_WEIGHT_TOO_LARGE: "Một lần cân tối đa 100 kg. Cân lại món.",
  DOMAIN_PAYMENT_INVALID_INTENT_TRANSITION:
    "Mã QR đã đổi trạng thái (đã được trả, đã hết hạn hoặc đã gỡ) nên không làm được thao tác này.",
  SYNC_ORDER_NOT_FOUND: "Máy chủ không tìm thấy đơn này ở chi nhánh của máy.",
  SYNC_NO_OPEN_SHIFT: "Máy chưa mở ca nên không ghi được thao tác này.",
  SYNC_PAYMENT_NEEDS_SHIFT: "Máy chưa mở ca nên không ghi được thanh toán. Mở ca rồi gửi lại.",
  SYNC_REFUND_NEEDS_SHIFT:
    "Máy chưa mở ca nên lần hoàn tiền không được ghi. Mở ca, rồi hoàn lại đơn này từ Lịch sử đơn để két khớp sổ.",
  SYNC_SHIFT_NOT_FOUND:
    "Máy chủ không tìm thấy ca mà lệnh ghi vào (ca của chi nhánh khác, hoặc ca chưa mở được). Báo cho quản lý.",
  SYNC_SHIFT_ID_TAKEN: "Mã ca trùng với một ca đã có của cửa hàng. Mở ca lại.",
  SYNC_SHIFT_ALREADY_OPEN:
    "Máy chủ đang giữ một ca chưa đóng của máy này nên không mở thêm ca được. Đóng ca đó trước.",
  SYNC_CASH_MOVE_ID_TAKEN: "Mã khoản thu/chi két trùng với một khoản đã có. Làm lại thao tác.",
  SYNC_INVALID_PAYLOAD: "Lệnh từ máy thiếu hoặc sai thông tin. Báo cho quản lý.",
  SYNC_EINVOICE_DISABLED: "Chi nhánh chưa bật hóa đơn điện tử nên không ghi được người mua.",
  SYNC_EINVOICE_NOT_FOUND:
    "Đơn được thanh toán lúc chi nhánh chưa bật hóa đơn điện tử nên không có hóa đơn để ghi người mua.",
  SYNC_EINVOICE_ALREADY_SENT:
    "Hóa đơn đã gửi đi phát hành nên không đổi được thông tin người mua nữa.",
  SYNC_EINVOICE_ORDER_CLOSED: "Đơn đã hủy nên không xuất hóa đơn.",
} as const;

/** How each command reads in the "needs attention" list. */
const VI_COMMAND_NAMES: Readonly<Record<string, string>> = {
  "order.save_draft": "Lưu đơn",
  "order.pay": "Thanh toán đơn",
  "order.refund": "Hoàn đơn",
  "order.cancel": "Hủy đơn",
  "order.void_line": "Hủy món",
  "order.apply_discount": "Giảm giá",
  "order.remove_discount": "Bỏ giảm giá",
  "order.set_buyer_info": "Ghi người mua hóa đơn",
  "order.mark_sent_to_kitchen": "Gửi phiếu pha chế",
  "payment.create_intent": "Tạo mã QR chuyển khoản",
  "payment.cancel_intent": "Gỡ mã QR chuyển khoản",
  "payment.hand_back_excess": "Thối lại tiền chuyển thừa",
  "shift.open": "Mở ca",
  "shift.close": "Đóng ca",
  "shift.cash_move": "Thu / chi két",
  "print.job_reported": "Báo kết quả in",
  "order.mark_pre_bill_printed": "In tạm tính",
  "table.transfer": "Chuyển bàn",
  "sync.rejection_dismissed": "Ghi nhận bỏ qua một lệnh",
};

/** A command's name for a person; a command this POS has no name for shows as it is. */
export const commandNameOf = (type: string): string => VI_COMMAND_NAMES[type] ?? type;
