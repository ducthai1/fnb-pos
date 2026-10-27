// Closing a business day, and matching bank transfers to QR codes by hand.

/** A till and its order number, as a manager finds the order on that till. */
const tillOrder = (deviceId: string, orderNo: number) =>
  `Máy …${deviceId.slice(-6)} · đơn số ${orderNo}`;

export const VI_DAY_CLOSE = {
  title: "Chốt ngày",
  hint: "Chốt ngày giữ nguyên số liệu của ngày và gửi dữ liệu hóa đơn trong ngày lên cơ quan thuế. Chốt rồi không làm lại hay hủy được.",
  dateLabel: "Ngày kinh doanh",
  closedAt: (when: string) => `Đã chốt lúc ${when}.`,
  open: "Ngày chưa chốt.",
  openShiftsTitle: "Ca chưa đóng",
  shift: (shiftId: string) => `Ca …${shiftId.slice(-6)}`,
  openDraftsTitle: "Đơn chưa thanh toán",
  unissuedTitle: "Hóa đơn điện tử đang chờ phát hành",
  failedTitle: "Hóa đơn điện tử lỗi hẳn (cần xử lý tay)",
  unsentTitle: "Hóa đơn đã phát hành nhưng chưa gửi cơ quan thuế",
  paidAfterTitle: "Đơn trả tiền sau khi đã chốt (không vào số liệu ngày đã chốt)",
  qrRefundedAfterTitle: "Tiền QR hoàn cho khách sau khi đã chốt (không vào số liệu ngày đã chốt)",
  qrRefund: (intentId: string, amount: string) => `Mã QR …${intentId.slice(-6)} · ${amount}`,
  order: tillOrder,
  invoice: (orderId: string, status: string, errorCode: string | null) =>
    `Đơn …${orderId.slice(-6)} · ${status}${errorCode === null ? "" : ` · ${errorCode}`}`,
  nothingOpen: "Không còn gì chặn việc chốt ngày.",
  checklistTitle: "Trước khi chốt",
  checks: {
    shifts: "Mọi ca đã đóng",
    drafts: "Không còn đơn chưa thanh toán",
    invoices: "Không còn hóa đơn chờ phát hành",
  },
  checkLeft: (count: number) => `còn ${count}`,
  checkDone: "xong",
  close: "Chốt ngày",
  closeTitle: (date: string) => `Chốt ngày ${date}?`,
  closeHint: "Số liệu ngày được giữ nguyên từ lúc này. Không hủy được thao tác này.",
  closing: "Đang chốt…",
  closedDone: (date: string) => `Đã chốt ngày ${date}.`,
  blockedTitle: "Chưa chốt được. Còn:",
  needsKey:
    "Vai trò của bạn xem được trạng thái ngày nhưng không chốt được: cần quyền duyệt chênh lệch két.",
} as const;

export const VI_TRANSFERS = {
  title: "Khớp chuyển khoản",
  hint: "Chuyển khoản hệ thống không tự khớp được (sai nội dung, mã QR đã hết hạn…). Chọn một giao dịch và mã QR của đơn đang chờ, rồi khớp.",
  counts: {
    transfers: "Chuyển khoản chưa khớp",
    intents: "Mã QR đang chờ tiền",
    refundDue: "Khoản cần hoàn",
  },
  countsNote: {
    transfers: "Chọn một dòng để khớp",
    intents: "Đơn chờ khách chuyển",
    refundDue: "Tiền QR không đơn nào dùng",
  },
  refundTitle: "Cần hoàn cho khách",
  refundHint:
    "Tiền QR ngân hàng đã báo nhận nhưng không đơn nào dùng (thiếu, thừa, hoặc đơn đã trả cách khác): cần hoàn cho khách.",
  refundRow: (code: string, received: string, asked: string) =>
    `Mã ${code}: đã nhận ${received} (mã QR yêu cầu ${asked}) — cần hoàn cho khách`,
  refundRowExcess: (code: string, received: string, asked: string, owed: string) =>
    `Mã ${code}: đã nhận ${received}, đơn đã thu ${asked} — cần hoàn phần thừa ${owed} cho khách`,
  transfersTitle: "Giao dịch chưa khớp",
  transfer: (amount: string, content: string, when: string) => `${amount} · “${content}” · ${when}`,
  intentsTitle: "Mã QR đang chờ tiền",
  intent: (code: string, amount: string, until: string) => `Mã ${code} · ${amount} · hạn ${until}`,
  statuses: {
    pending: "đang chờ",
    expired: "đã hết hạn",
    paid: "đã trả",
    partial: "trả thiếu",
    overpaid: "trả thừa",
    cancelled: "đã hủy",
  } as Readonly<Record<string, string>>,
  none: "Không có.",
  match: "Khớp giao dịch với mã QR",
  chooseBoth: "Chọn một giao dịch và một mã QR để khớp.",
  matchTitle: (amount: string, code: string) => `Khớp giao dịch ${amount} với mã QR ${code}?`,
  matchHint:
    "Đơn của mã QR sẽ được tính là đã nhận số tiền của giao dịch. Không hủy được thao tác này.",
  matching: "Đang khớp…",
  matched: (code: string) => `Đã khớp với mã QR ${code}.`,
  needsKey: "Khớp tay cần quyền quản lý cài đặt.",
  handBack: "Đã hoàn cho khách",
  handBackTitle: (code: string, amount: string) =>
    `Ghi đã hoàn ${amount} của mã QR ${code} cho khách?`,
  handBackHint:
    "Chỉ ghi khi tiền đã thật sự trả lại khách. Ghi rồi không sửa hay hủy được; số tiền vào báo cáo ngày hôm nay, không tính là doanh thu.",
  handBackMethod: "Hoàn bằng",
  handBackMethods: {
    cash_from_drawer: "Tiền mặt từ két (chọn ca đang mở)",
    cash: "Tiền mặt ngoài két",
    bank_transfer: "Chuyển khoản",
  } as Readonly<Record<string, string>>,
  handBackShift: "Ca đang mở (két đã lấy tiền)",
  handBackShiftOption: (device: string, staff: string, time: string) =>
    `${device} · ${staff} mở lúc ${time}`,
  handBackShiftNoDevice: "Ca chung của chi nhánh",
  handBackChooseShift: "Chọn ca có két đã lấy tiền ra trả khách.",
  handBackNoOpenShift:
    "Chi nhánh không có ca nào đang mở: chọn tiền mặt ngoài két hoặc chuyển khoản.",
  handBackFromDrawerHint:
    "Máy ghi một khoản chi két vào ca đã chọn: tiền dự kiến của ca giảm đúng số này.",
  handBackNote: "Ghi chú (hoàn cho ai, vì sao)",
  handBackChooseMethod: "Chọn hoàn bằng tiền mặt từ két, tiền mặt ngoài két hay chuyển khoản.",
  handBackNeedsNote: "Ghi chú hoàn cho ai, vì sao.",
  handBackConfirm: "Ghi đã hoàn",
  handingBack: "Đang ghi…",
  handedBack: (code: string, amount: string) =>
    `Đã ghi: hoàn ${amount} của mã QR ${code} cho khách.`,
  handBackNeedsKey: "Ghi đã hoàn tiền cần quyền quản lý cài đặt.",
} as const;
