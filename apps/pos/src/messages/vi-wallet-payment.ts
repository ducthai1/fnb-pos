// The e-wallet cards of the payment drawer (ZaloPay first); vi.ts gathers them under `vi.wallet`.

export const VI_WALLET_PAYMENT = {
  names: { zalopay: "ZaloPay" } as Readonly<Record<string, string>>,
  offline: (wallet: string) =>
    `Thanh toán ${wallet} cần có mạng: máy đang mất kết nối. Thu tiền mặt hoặc chuyển khoản QR.`,
  wholeOrderOnly: (wallet: string) =>
    `${wallet} nhận đúng cả đơn: bỏ phần tiền mặt đã nhận nếu khách muốn trả bằng ví.`,
  needsServer: (wallet: string) =>
    `Chưa gửi được đơn lên máy chủ nên chưa tạo được mã ${wallet}. Kiểm tra mạng rồi thử lại.`,
  imageLabel: (wallet: string, amount: string) => `Mã ${wallet} thanh toán ${amount}`,
  amount: "Số tiền",
  timeLeft: "Mã còn hiệu lực",
  phases: {
    drawing: (wallet: string) => `Đang tạo mã ${wallet}…`,
    waiting: (wallet: string) =>
      `Khách mở app ${wallet}, quét mã và xác nhận. Máy tự hoàn tất khi ${wallet} báo đã trả.`,
    paid: (wallet: string) => `${wallet} báo đã nhận đủ tiền. Đang hoàn tất đơn…`,
    short: (gap: string) => `Ví báo nhận thiếu ${gap} — xử lý ở quầy.`,
    over: (gap: string) => `Ví báo nhận thừa ${gap} — xử lý ở quầy.`,
    expired: "Mã đã hết hạn. Tạo mã mới nếu khách vẫn muốn trả bằng ví.",
    withdrawn: "Mã đã được gỡ (đơn đã thu cách khác hoặc đã đổi).",
  },
  cancel: "Hủy mã",
  otherMethod: "Thu cách khác",
  renew: "Tạo mã mới",
  retry: "Thử lại",
} as const;

/** What the server answers a wallet payment with, as the till says it. */
export const VI_WALLET_ERRORS = {
  API_WALLET_NOT_ENABLED: "Chi nhánh chưa bật ví này hoặc chưa nhập khóa. Quản lý bật ở trang quản lý (Cài đặt, mục Ví điện tử).",
  API_WALLET_UNAVAILABLE: "Ví chưa tạo được mã thanh toán (ví từ chối hoặc không trả lời). Thử lại hoặc thu cách khác.",
  API_WALLET_ORDER_NOT_SYNCED: "Máy chủ chưa nhận được đơn này. Chờ đồng bộ xong rồi thử lại.",
  API_WALLET_ORDER_NOT_OPEN: "Đơn đã thanh toán hoặc đã hủy.",
  API_WALLET_PAYMENT_WITHDRAWN: "Mã ví đã được gỡ vì đơn đã thu cách khác.",
  API_WALLET_UNKNOWN: "Máy chủ chưa hỗ trợ ví này.",
} as const;
