/** What the till says while it catches up with a server restored from a backup. */
export const VI_SERVER_RESTORE = {
  resending: (count: number) =>
    `Máy chủ vừa được khôi phục — đang gửi lại ${count} thao tác của máy này`,
  unrecoverable: (count: number) =>
    `Máy chủ được khôi phục từ bản sao lưu quá cũ: ${count} thao tác không còn trên máy để gửi lại. Báo quản lý trước khi bán tiếp.`,
};
