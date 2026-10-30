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
