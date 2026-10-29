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
  now: "Cập nhật ngay",
  updating: "Đang cập nhật…",
  waitOutbox: (count: number) =>
    count > 0
      ? `Còn ${count} thao tác chưa gửi lên máy chủ. Chờ gửi xong rồi cập nhật.`
      : "Máy đang kiểm tra thao tác chưa gửi. Chờ một chút rồi cập nhật.",
  waitDialog: "Xong thao tác đang làm rồi hãy cập nhật.",
};
