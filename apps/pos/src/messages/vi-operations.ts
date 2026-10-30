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
  refusedToo: (count: number) => `Và ${count} lệnh trong mục "Cần xử lý" chưa được xử lý.`,
  warning:
    "Ghép lại máy sẽ xóa dữ liệu bán hàng trên máy này, kể cả các thao tác chưa gửi. Báo quản lý và ghi lại các đơn trên trước khi xóa.",
  pair: "Ghép lại máy",
  confirmDelete: (count: number) => `Xóa ${count} thao tác và ghép lại máy`,
  back: "Chưa xóa, giữ nguyên",
  clearing: "Đang xóa dữ liệu trên máy…",
  failed: "Không xóa được dữ liệu trên máy. Tải lại trang rồi thử lại.",
};
