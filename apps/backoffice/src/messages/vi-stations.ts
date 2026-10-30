// The stations page: where a branch makes what it sells (bar, hot kitchen, bakery counter).

export const VI_STATIONS = {
  title: "Trạm pha chế/bếp",
  hint: "Nơi món được làm ở chi nhánh đang xem: bar, bếp nóng, quầy bánh… Phiếu bếp của một món in ở trạm của nó. Gán món cho trạm ở trang sửa món; món chưa gán trạm thì không có phiếu bếp.",
  empty: "Chi nhánh chưa có trạm nào. Thêm trạm đầu tiên, ví dụ “Bar”, rồi gán món cho nó ở trang sửa món.",
  nameLabel: "Tên trạm",
  newLabel: "Trạm mới",
  add: "Thêm trạm",
  rename: "Đổi tên",
  renameLabel: (name: string) => `Đổi tên ${name}`,
  deleteLabel: (name: string) => `Xóa ${name}`,
  deleteTitle: (name: string) => `Xóa trạm “${name}”?`,
  deleteHint:
    "Trạm chưa từng in phiếu bếp thì được xóa hẳn. Trạm đã in phiếu thì được lưu trữ: ẩn khỏi danh sách này và khỏi ô chọn trạm, phiếu cũ vẫn giữ, dùng lại được sau. Còn món đang bán gán cho trạm thì chưa xóa hay lưu trữ được, vì món đó sẽ không có phiếu bếp.",
  deleting: "Đang xóa…",
  added: (name: string) => `Đã thêm trạm “${name}”.`,
  renamed: (name: string) => `Đã đổi tên thành “${name}”.`,
  deleted: (name: string) => `Đã xóa trạm “${name}”.`,
  archivedDone: (name: string) =>
    `Trạm “${name}” đã từng in phiếu nên được lưu trữ: không còn trong danh sách và ô chọn trạm, phiếu cũ vẫn giữ.`,
  archivedTitle: (count: number) => `Đã lưu trữ (${count})`,
  archivedHint: "Trạm đã lưu trữ không nhận món mới và không hiện ở ô chọn trạm khi sửa món.",
  resume: "Dùng lại",
  resumeLabel: (name: string) => `Dùng lại ${name}`,
  resumed: (name: string) => `Trạm “${name}” đã được dùng lại.`,
  search: "Tìm trạm",
  inUse:
    "Chưa xóa được: còn món đang bán gán cho trạm này, món đó sẽ không có phiếu bếp. Chuyển các món sang trạm khác ở trang sửa món rồi xóa lại.",
  conflict: "Có người đã sửa trạm này trước bạn. Danh sách đã được tải lại.",
  columns: { name: "Tên trạm" },
} as const;
