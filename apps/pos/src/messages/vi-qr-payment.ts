// The VietQR of the payment drawer; vi.ts gathers them under `vi.qr`.

export const VI_QR_PAYMENT = {
  title: "Chuyển khoản QR",
  noAccount:
    "Chưa có tài khoản nhận chuyển khoản nên chưa tạo được QR. Quản lý nhập tài khoản ở trang quản lý (Cài đặt, mục Tài khoản nhận tiền).",
  wholeOrderOnly: "Mã QR nhận đúng cả đơn: bỏ phần tiền mặt đã nhận nếu khách muốn chuyển khoản.",
  amount: "Số tiền",
  content: "Nội dung chuyển khoản",
  accountNumber: "Số tài khoản",
  accountName: "Chủ tài khoản",
  timeLeft: "Mã còn hiệu lực",
  imageLabel: (amount: string) => `Mã QR chuyển khoản ${amount}`,
  phases: {
    drawing: "Đang tạo mã QR…",
    waiting: "Đưa mã cho khách quét. Máy tự chuyển sang “đã nhận” khi ngân hàng báo tiền về.",
    paid: "Đã nhận đủ tiền chuyển khoản. Đang hoàn tất đơn…",
    short: (gap: string) => `Khách chuyển thiếu ${gap}.`,
    over: (gap: string) => `Khách chuyển thừa ${gap}.`,
    shortHint:
      "Đơn chưa đóng. Thu nốt phần thiếu bằng tiền mặt hoặc một mã QR mới đúng số đó. Khách không trả nữa thì chọn Thu cách khác: khoản đã chuyển vào danh sách cần hoàn ở trang quản lý.",
    gapHint:
      "Đơn chưa được đóng. Thu đủ bằng cách khác; khoản khách đã chuyển nằm trong danh sách cần hoàn ở trang quản lý.",
    overHint:
      "Đơn đóng bằng đúng số tiền của mã QR. Thối phần thừa bằng tiền mặt trong két (máy ghi một khoản chi két), hoặc đóng đơn để quản lý hoàn sau ở trang quản lý.",
    expired: "Mã QR đã hết hạn. Nếu khách chưa chuyển, tạo mã mới.",
    expiredLate:
      "Mã QR đã hết hạn và có tiền chuyển đến muộn. Báo quản lý khớp tay trước khi thu lại của khách.",
    withdrawn: "Mã QR này đã bị gỡ (đơn đã thu cách khác hoặc đã đổi). Tạo mã mới nếu cần.",
    refused: "Máy chủ không nhận mã QR này.",
  },
  leaveWhileOffline: {
    title: "Máy chưa biết khách đã chuyển khoản chưa",
    hint: "Máy đang mất kết nối với máy chủ, nên ngân hàng có thể đã báo tiền về mà máy chưa nhận được. Xem app ngân hàng của quán trước khi lấy tiền mặt.",
    checksLabel: "Trước khi thu cách khác",
    checks: [
      "Mở app ngân hàng của quán, tìm khoản đúng số tiền của đơn.",
      "Hỏi khách đã bấm chuyển chưa, nhờ khách cho xem màn hình chuyển khoản.",
    ],
    risk: "Khách đã chuyển mà vẫn thu tiền mặt thì khách trả hai lần và quán phải hoàn một khoản.",
    stay: "Quay lại, chờ khách chuyển",
    go: "Khách chưa chuyển, thu cách khác",
  },
  cancel: "Hủy QR",
  renew: "Tạo QR mới",
  otherMethod: "Thu cách khác",
  cashForRest: (gap: string) => `Thu nốt ${gap} tiền mặt`,
  qrForRest: (gap: string) => `QR cho phần còn lại ${gap}`,
  handBackCash: (gap: string) => `Thối lại ${gap} tiền mặt`,
  closeOverLater: "Đóng đơn, quản lý hoàn sau",
  retryPay: "Hoàn tất bằng chuyển khoản đã nhận",
  closeWithSettledQr: "Đóng đơn bằng QR đã nhận",
  openShiftToClose: "Mở ca để đóng đơn này",
  noSettledQr: "Máy chưa thấy QR đã được trả của đơn này. Chờ đồng bộ xong rồi thử lại.",
  drawFailed: "Không tạo được mã QR trên máy. Thu cách khác hoặc báo quản lý.",
  failed: "Không lưu được thanh toán trên máy. Thử lại; nếu vẫn lỗi, báo cho quản lý.",
} as const;
