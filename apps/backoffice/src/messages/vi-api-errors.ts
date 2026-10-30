// The sentence for each error code the API answers the backoffice with (`{code}` bodies).

export const VI_API_ERRORS: Readonly<Record<string, string>> = {
  API_INVALID_REQUEST: "Thông tin gửi đi không hợp lệ. Kiểm tra lại các ô đã nhập.",
  API_INTERNAL: "Máy chủ đang gặp lỗi. Thử lại sau ít phút.",
  API_RATE_LIMITED:
    "Có quá nhiều lần thử trong một lúc nên máy chủ tạm từ chối. Đợi một phút rồi thử lại.",
  API_ORIGIN_NOT_ALLOWED:
    "Máy chủ không nhận yêu cầu từ địa chỉ trang này. Mở trang quản lý bằng đúng địa chỉ của cửa hàng; nếu vẫn lỗi, báo hỗ trợ.",
  API_AUTH_INVALID_CREDENTIALS:
    "Sai email/số điện thoại hoặc mật khẩu. Sai 5 lần liền thì tài khoản bị khóa 15 phút.",
  API_AUTH_NO_ACTIVE_MEMBERSHIP: "Tài khoản này chưa thuộc cửa hàng nào đang hoạt động.",
  API_AUTH_NOT_A_MEMBER: "Tài khoản không còn thuộc tổ chức đã chọn. Chọn lại tổ chức.",
  API_AUTH_ORGANIZATION_REQUIRED: "Tài khoản thuộc nhiều tổ chức: chọn một tổ chức để vào.",
  API_AUTH_UNAUTHENTICATED: "Phiên đăng nhập đã hết. Đăng nhập lại.",
  API_PERMISSION_DENIED: "Vai trò của bạn không có quyền làm việc này. Nhờ chủ quán cấp quyền.",
  API_PERMISSION_UNKNOWN_KEY: "Có một quyền không còn tồn tại. Tải lại trang rồi thử lại.",
  API_PERMISSION_INVALID_THRESHOLD:
    "Ngưỡng không hợp lệ: giảm giá từ 0 đến 100%, thu/chi là số tiền nguyên; chỉ đặt cho quyền đã bật.",
  API_PERMISSION_INVALID_ACTION: "Giá trị gửi kèm quyền không hợp lệ.",
  API_BRANCH_NOT_FOUND: "Không tìm thấy chi nhánh này. Tải lại trang.",
  API_DEVICE_NOT_FOUND: "Không tìm thấy thiết bị này. Tải lại danh sách.",
  API_DEVICE_PAIRING_CODE_INVALID: "Mã ghép không đúng, đã hết hạn hoặc đã được dùng.",
  API_DEVICE_UNAUTHENTICATED: "Thiết bị không còn được ghép với cửa hàng.",
  API_STAFF_PIN_FORMAT: "PIN gồm 4 đến 6 chữ số.",
  API_STAFF_PIN_TOO_WEAK:
    "PIN quá dễ đoán (như 1234, 1111, 1212, 2580 hoặc một năm sinh). Chọn PIN khác.",
  API_STAFF_NOT_FOUND: "Không tìm thấy nhân viên này. Tải lại danh sách.",
  API_STAFF_ALREADY_INACTIVE: "Nhân viên này đã bị khóa rồi. Tải lại danh sách.",
  API_STAFF_ALREADY_ACTIVE: "Nhân viên này đang làm, không cần mở lại. Tải lại danh sách.",
  API_STAFF_PIN_NOT_LOCKED: "PIN của nhân viên này không bị khóa, không có gì để mở. Tải lại danh sách.",
  API_CATALOG_STATION_ARCHIVED:
    "Trạm này đã lưu trữ nên không gán cho món đang bán được. Chọn trạm khác, hoặc dùng lại trạm ở trang Trạm pha chế/bếp.",
  API_STAFF_VERSION_CONFLICT:
    "Có người đã sửa nhân viên này trước bạn. Danh sách đã được tải lại; xem lại rồi bấm lưu lần nữa nếu vẫn cần.",
  API_ROLE_VERSION_CONFLICT:
    "Có người đã sửa vai trò này trước bạn. Tải lại danh sách để xem bản mới nhất, rồi làm lại nếu vẫn cần.",
  API_ROLE_ARCHIVED: "Vai trò này đã lưu trữ, không gán cho ai được nữa. Chọn vai trò khác.",
  API_ROLE_NOT_FOUND: "Không tìm thấy vai trò này. Tải lại trang.",
  API_ROLE_IN_USE: "Vai trò đang có người giữ. Chuyển họ sang vai trò khác trước.",
  API_ROLE_LAST_ADMINISTRATOR:
    "Không bỏ được quyền quản lý nhân viên: cửa hàng sẽ không còn ai quản lý được nhân viên và vai trò.",
  API_CATALOG_PRODUCT_NOT_FOUND: "Không tìm thấy món này. Có thể món đã bị xóa khỏi thương hiệu.",
  API_CATALOG_CATEGORY_NOT_FOUND: "Không tìm thấy danh mục này. Tải lại danh sách.",
  API_CATALOG_STATION_NOT_FOUND: "Không tìm thấy trạm pha chế/bếp này. Tải lại trang.",
  API_CATALOG_PRICE_LIST_NOT_FOUND: "Không tìm thấy bảng giá này.",
  API_CATALOG_BRAND_NOT_FOUND: "Không tìm thấy thương hiệu của chi nhánh. Tải lại trang.",
  API_CATALOG_BRANCH_NOT_FOUND: "Không tìm thấy chi nhánh này. Tải lại trang.",
  API_CATALOG_REFERENCE_NOT_FOUND:
    "Danh mục, trạm hoặc món được chọn không còn tồn tại. Tải lại rồi chọn lại.",
  API_CATALOG_VERSION_CONFLICT: "Có người đã sửa mục này trước bạn. Tải lại để xem bản mới nhất.",
  API_CATALOG_ID_CONFLICT: "Mã của một mục bị trùng với mục đã có. Tải lại trang rồi thử lại.",
  API_CATALOG_PARENT_CHANGE_NOT_ALLOWED: "Không chuyển được mục này sang thương hiệu khác.",
  API_CATALOG_PRODUCT_CODE_TAKEN: "Mã hàng này đã có món khác đang bán dùng (không phân biệt hoa thường). Đổi mã khác.",
  API_CATALOG_COMBO_OPTION_IS_COMBO: "Một phần của combo không thể là combo khác. Chọn món thường.",
  API_CATALOG_COMBO_OPTION_ARCHIVED: "Combo có món đã ngừng bán. Bỏ món đó khỏi combo hoặc cho bán lại món đó.",
  API_CATALOG_IN_USE: "Mục này đang được món hoặc bảng giá dùng. Gỡ khỏi chúng trước khi xóa.",
  API_CATALOG_UNAVAILABLE_UNTIL_NOT_IN_FUTURE: "Giờ có lại món phải ở sau bây giờ.",
  API_SHOP_TEMPLATE_NOT_FOUND: "Không tìm thấy mẫu này. Tải lại trang.",
  API_SHOP_TEMPLATE_FLAG_RULE_BROKEN:
    "Không áp được mẫu: các công tắc của mẫu vướng luật giữa các công tắc ở một nơi khác. Chưa có gì bị thay đổi.",
};
