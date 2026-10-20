// Opening the shift, taking the money, the slips; vi.ts gathers them under `vi.checkout`.

export const VI_CHECKOUT = {
  openShift: {
    title: "Mở ca",
    hint: "Đếm tiền đầu ca trong két: mỗi lần chạm thêm một tờ. Két trống thì mở ca luôn.",
    addNote: (note: string) => `+ ${note}`,
    noteCount: (note: string) => `Số tờ ${note}`,
    removeNote: (note: string) => `Bớt một tờ ${note}`,
    total: (amount: string) => `Tiền đầu ca: ${amount}`,
    clear: "Đếm lại",
    open: "Mở ca",
    failed: "Không mở được ca trên máy. Thử lại; nếu vẫn lỗi, báo cho quản lý.",
    checking: "Đang kiểm tra ca…",
  },
} as const;
