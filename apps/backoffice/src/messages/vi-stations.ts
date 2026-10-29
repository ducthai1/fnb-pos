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
    "Chỉ xóa được trạm không còn món nào gán và chưa từng in phiếu bếp. Món đang gán cho trạm sẽ không có phiếu bếp nếu trạm mất, nên máy chủ không cho xóa khi còn món.",
  deleting: "Đang xóa…",
  added: (name: string) => `Đã thêm trạm “${name}”.`,
  renamed: (name: string) => `Đã đổi tên thành “${name}”.`,
  deleted: (name: string) => `Đã xóa trạm “${name}”.`,
  search: "Tìm trạm",
  inUse:
    "Chưa xóa được: trạm này còn món gán cho nó hoặc đã từng in phiếu bếp. Chuyển các món sang trạm khác ở trang sửa món; trạm đã từng in phiếu thì giữ lại và đổi tên nếu cần.",
  conflict: "Có người đã sửa trạm này trước bạn. Danh sách đã được tải lại.",
  columns: { name: "Tên trạm" },
} as const;
