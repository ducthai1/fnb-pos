/** What the till says when it hits a fault of its own, and when a new release is waiting. */
export const VI_CRASH = {
  title: "Máy bán hàng gặp sự cố",
  hint: "Màn hình vừa gặp lỗi nên tạm dừng. Bấm Tải lại để làm việc tiếp.",
  safeTitle: "Dữ liệu bán hàng vẫn an toàn",
  safeHint:
    "Đơn và tiền đã ghi trên máy được giữ nguyên, sẽ tự gửi lên khi có mạng. Nếu lỗi lặp lại, báo cho quản lý.",
  reload: "Tải lại",
};

export const VI_UPDATE = {
  banner: "Có bản cập nhật — sẽ cập nhật sau khi đóng ca",
  bannerShort: "Có bản cập nhật mới",
  fold: "Thu nhỏ thẻ cập nhật",
  unfold: "Xem",
  now: "Cập nhật ngay",
  updating: "Đang cập nhật…",
  waitOutbox: (count: number) =>
    count > 0
      ? `Còn ${count} thao tác chưa gửi lên máy chủ. Chờ gửi xong rồi cập nhật.`
      : "Máy đang kiểm tra thao tác chưa gửi. Chờ một chút rồi cập nhật.",
  waitDialog: "Xong thao tác đang làm rồi hãy cập nhật.",
  required: {
    title: "Cần cập nhật máy bán hàng",
    hint: "Máy chủ đã nâng cấp và không nhận thao tác từ phiên bản này nữa. Cập nhật rồi bán tiếp.",
    pending: (count: number) =>
      `Máy còn ${count} thao tác chưa gửi. Chúng vẫn được giữ trên máy và tự gửi sau khi cập nhật.`,
    nothingPending: "Không có thao tác nào bị mất khi cập nhật.",
    stillOld: "Cập nhật xong mà vẫn hiện màn này: báo quản lý.",
  },
};

/** What the till says once the server tells it that it was taken out of the shop's devices. */
export const VI_REVOKED = {
  title: "Máy này đã bị gỡ khỏi cửa hàng",
  hint:
    "Quản lý đã thu hồi máy này trong trang quản lý (mục Thiết bị), nên máy không bán và không gửi được gì lên máy chủ nữa. Muốn dùng lại, xin mã ghép mới ở trang quản lý rồi ghép máy.",
  nothingWaiting: "Máy không còn thao tác nào chưa gửi.",
  waiting: (count: number) =>
    `Máy còn ${count} thao tác chưa gửi lên máy chủ. Máy chủ sẽ không nhận chúng từ máy đã bị thu hồi.`,
  waitingList: "Thao tác chưa gửi",
  warning:
    "Ghép lại máy sẽ xóa dữ liệu bán hàng trên máy này, kể cả các thao tác chưa gửi. Báo quản lý và ghi lại các đơn trên trước khi xóa.",
  pair: "Ghép lại máy",
  confirmDelete: (count: number) => `Xóa ${count} thao tác và ghép lại máy`,
  back: "Chưa xóa, giữ nguyên",
  clearing: "Đang xóa dữ liệu trên máy…",
  failed: "Không xóa được dữ liệu trên máy. Tải lại trang rồi thử lại.",
  flush: {
    open: (count: number) => `Gửi nốt ${count} thao tác bằng mã quản lý`,
    title: "Gửi nốt thao tác chưa gửi",
    hint:
      "Quản lý mở trang quản lý → Thiết bị, bấm Cho gửi nốt ở dòng của máy này rồi đọc mã cho bạn. Mã dùng một lần, sống 10 phút. Máy vẫn bị gỡ khỏi cửa hàng sau khi gửi.",
    codeLabel: "Mã cho gửi nốt",
    codeIncomplete: "Mã gồm 8 ký tự. Nhập đủ mã quản lý đọc.",
    submit: (count: number) => `Gửi nốt ${count} thao tác`,
    sending: "Đang gửi lên máy chủ…",
    back: "Quay lại",
    sent: (count: number) => `Máy chủ đã nhận ${count} thao tác.`,
    nothingSent: "Máy chủ chưa nhận thêm thao tác nào.",
    invalid:
      "Mã không đúng, đã hết hạn hoặc đã dùng. Xin quản lý tạo mã mới ở trang quản lý (mục Thiết bị).",
    offline:
      "Không gửi được vì mất kết nối. Thao tác chưa gửi vẫn nằm trên máy: kiểm tra mạng rồi bấm gửi lại với cùng mã.",
    tooOld: "Máy chủ không nhận từ phiên bản máy này nữa. Cập nhật máy rồi gửi lại.",
    notRevoked: "Máy chủ báo máy này chưa bị gỡ. Tải lại trang để bán tiếp.",
    failed: "Máy chủ chưa nhận hết. Thao tác còn lại vẫn nằm trên máy, thử gửi lại với cùng mã.",
  },
  refusedTitle: (count: number) =>
    `Máy chủ không nhận ${count} thao tác — báo quản lý ghi lại trước khi xóa`,
  refusedList: "Thao tác máy chủ không nhận",
};
