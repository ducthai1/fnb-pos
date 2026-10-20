// Sentences for the codes of settings, payments, day close, reports and the floor plan.

export const VI_API_ERRORS_OPERATIONS: Readonly<Record<string, string>> = {
  API_SETTINGS_UNKNOWN_KEY: "Máy chủ không biết cài đặt này. Tải lại trang.",
  API_SETTINGS_SCOPE_NOT_FOUND: "Không tìm thấy thương hiệu, chi nhánh hoặc máy này. Tải lại trang.",
  API_SETTINGS_LAYER_NOT_ALLOWED: "Cài đặt này không đặt được ở tầng đang chọn.",
  FLAGS_REQUIRES_MISSING: "Công tắc này cần một công tắc khác bật trước.",
  FLAGS_EXCLUDES_BOTH_ON: "Hai công tắc này không bật cùng lúc được.",
  API_EINVOICE_UNKNOWN_PROVIDER:
    "Máy chủ chưa kết nối nhà cung cấp hóa đơn này. Kiểm tra lại mã nhà cung cấp.",
  API_PAYMENT_UNKNOWN_GATEWAY: "Cổng thanh toán này chưa được hỗ trợ.",
  API_PAYMENTS_NOT_CONFIGURED: "Máy chủ chưa được cấu hình để lưu bí mật cổng thanh toán. Báo hỗ trợ.",
  API_PAYMENT_SECRET_IN_USE:
    "Một chi nhánh khác đã dùng bí mật này cho cùng cổng thanh toán. Mỗi chi nhánh cần bí mật riêng.",
  API_PAYMENT_TRANSACTION_NOT_FOUND: "Không tìm thấy giao dịch chuyển khoản này. Làm mới danh sách.",
  API_PAYMENT_TRANSACTION_NOT_MATCHABLE:
    "Giao dịch này đã được khớp với mã QR khác, hoặc là tiền chuyển ra. Làm mới danh sách.",
  API_PAYMENT_INTENT_NOT_FOUND: "Không tìm thấy mã QR này. Làm mới danh sách.",
  API_PAYMENT_INTENT_NOT_MATCHABLE: "Mã QR này đã được trả hoặc đã hủy, không nhận thêm giao dịch.",
  API_PAYMENT_BRANCH_MISMATCH: "Giao dịch vào tài khoản của chi nhánh khác với mã QR này.",
  API_PAYMENT_ORDER_NOT_PAYABLE:
    "Đơn của mã QR này đã trả bằng cách khác, đã hủy, hoặc đã có QR khác nhận đủ tiền. Không khớp được: tiền này cần hoàn lại cho khách.",
  API_DAY_ALREADY_CLOSED: "Ngày này đã chốt rồi. Chốt ngày không làm lại hay hủy được.",
  API_DAY_CLOSE_SHIFTS_OPEN: "Còn ca chưa đóng trong ngày. Đóng các ca dưới đây rồi chốt lại.",
  API_DAY_CLOSE_DRAFTS_OPEN:
    "Còn đơn chưa thanh toán trong ngày. Thanh toán hoặc hủy các đơn dưới đây rồi chốt lại.",
  API_DAY_CLOSE_INVOICES_UNISSUED:
    "Còn hóa đơn điện tử đang chờ phát hành. Đợi phát hành xong (danh sách dưới đây) rồi chốt lại.",
  API_DAY_CLOSE_DAY_NOT_STARTED: "Ngày kinh doanh này chưa bắt đầu ở chi nhánh, chưa chốt được.",
  API_REPORT_INVALID_RANGE: "Khoảng thời gian không hợp lệ: giờ bắt đầu phải trước giờ kết thúc.",
  API_FLOOR_BRANCH_NOT_FOUND: "Không tìm thấy chi nhánh này. Tải lại trang.",
  API_FLOOR_AREA_NOT_FOUND: "Không tìm thấy khu vực này. Tải lại danh sách.",
  API_FLOOR_TABLE_NOT_FOUND: "Không tìm thấy bàn này. Tải lại danh sách.",
  API_FLOOR_VERSION_CONFLICT: "Có người đã sửa mục này trước bạn. Tải lại để xem bản mới nhất.",
  API_FLOOR_ID_CONFLICT: "Mã của mục bị trùng. Tải lại trang rồi thử lại.",
  API_FLOOR_BRANCH_CHANGE_NOT_ALLOWED: "Không chuyển khu vực hay bàn sang chi nhánh khác được.",
  API_FLOOR_ARCHIVED: "Mục này đã lưu trữ, không sửa được nữa.",
  API_FLOOR_AREA_ARCHIVED: "Khu vực đã lưu trữ: không thêm hay giữ bàn đang dùng trong đó.",
  API_FLOOR_AREA_HAS_TABLES: "Khu vực còn bàn đang dùng. Lưu trữ hoặc chuyển các bàn trước.",
  API_FLOOR_TABLE_HAS_OPEN_ORDER: "Bàn đang có khách. Thanh toán, hủy hoặc chuyển đơn trước.",
};
