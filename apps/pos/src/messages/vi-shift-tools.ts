// The drawer outside a sale, closing the shift, and who is at the till; vi.ts gathers them
// under `vi.cash`, `vi.closeShift` and `vi.session`.

export const VI_CASH = {
  open: "Thu/chi két",
  title: "Thu/chi két",
  in: "Thu vào két",
  out: "Chi ra khỏi két",
  amount: "Số tiền (đồng)",
  kindTitle: "Thu hay chi",
  amountTitle: "Số tiền và lý do",
  reason: "Lý do",
  reasonHint: "Ví dụ: đổi tiền lẻ, trả tiền đá",
  unreadable: "Số tiền chỉ gồm chữ số, lớn hơn 0.",
  expectedAfter: (amount: string) => `Tiền dự kiến trong két sau đó: ${amount}`,
  confirm: (kind: "in" | "out", amount: string) =>
    kind === "in" ? `Thu ${amount} vào két` : `Chi ${amount} khỏi két`,
  done: (kind: "in" | "out", amount: string) =>
    kind === "in" ? `Đã thu ${amount} vào két.` : `Đã chi ${amount} khỏi két.`,
  back: "Về bán hàng",
} as const;

export const VI_CLOSE_SHIFT = {
  open: "Đóng ca",
  title: "Đóng ca",
  hint: "Đếm tiền trong két theo từng mệnh giá: mỗi lần chạm thêm một tờ.",
  countTitle: "Tiền đếm trong két",
  figuresTitle: "Sổ tiền mặt của ca",
  figures: {
    opening: "Tiền đầu ca",
    sales: "Thu tiền mặt",
    refunds: "Hoàn tiền mặt",
    cashIn: "Thu vào két",
    cashOut: "Chi khỏi két",
    expected: "Tiền dự kiến",
    counted: "Tiền đếm được",
    difference: "Chênh lệch",
  },
  noDifference: "Khớp với tiền dự kiến.",
  short: (amount: string) => `Thiếu ${amount} so với tiền dự kiến.`,
  over: (amount: string) => `Thừa ${amount} so với tiền dự kiến.`,
  needsApproval: "Chênh lệch vượt mức cho phép của quán: cần quản lý duyệt khi đóng ca.",
  estimateNote:
    "Tiền dự kiến theo sổ ca của máy chủ (mọi khoản tiền mặt vào két ca này), cộng các khoản máy này chưa gửi được.",
  serverDisagreed: (difference: string) =>
    `Máy chủ tính ra chênh lệch ${difference} với số đã đếm, cần quản lý duyệt. Đếm lại nếu cần rồi đóng ca, quản lý sẽ được hỏi duyệt đúng số này.`,
  confirm: "Đóng ca",
  back: "Về bán hàng",
  doneTitle: "Đã đóng ca",
  done: (difference: string) => `Ca đã đóng, chênh lệch ${difference}.`,
  openNext: "Mở ca mới",
  failed: "Không ghi được lệnh đóng ca trên máy. Thử lại; nếu vẫn lỗi, báo cho quản lý.",
  slipDay: "Ngày",
  /** The head of a closing slip printed before the server answered. */
  provisionalTitle: "PHIẾU ĐÓNG CA (TẠM — chưa đối chiếu máy chủ)",
  provisionalNotice:
    "Máy chưa nhận được số của máy chủ (mất mạng hoặc máy chủ chậm) nên phiếu này tính theo số trên máy. Khi máy chủ nhận ca, bấm “In bản chính thức”.",
  printOfficial: "In bản chính thức",
  officialWaiting: "Đang chờ máy chủ nhận ca…",
  officialDone: "Đã in bản chính thức theo số của máy chủ.",
  serverRefused:
    "Máy chủ chưa nhận việc đóng ca này nên ca vẫn mở. Đếm lại tiền rồi đóng ca; nếu máy hỏi, nhờ quản lý duyệt.",
} as const;

export const VI_SESSION = {
  signOut: "Đăng xuất",
  signedOut: (name: string) => `${name} đã đăng xuất.`,
} as const;

export const VI_TILL_CLOCK = {
  off: (minutes: number) =>
    `Giờ máy lệch ${minutes} phút — máy đang dùng giờ máy chủ. Nên chỉnh lại giờ Windows.`,
} as const;

export const VI_SESSION_ERRORS = {
  SYNC_DEVICE_CLOCK_AHEAD:
    "Giờ máy nhanh hơn máy chủ — máy đã tự dùng giờ máy chủ và gửi lại. Nên chỉnh lại giờ Windows.",
  API_ORIGIN_NOT_ALLOWED:
    "Máy chủ không nhận thao tác từ địa chỉ trang POS này. Báo quản lý kiểm tra địa chỉ mở POS trong cài đặt máy chủ.",
} as const;
