// A manager's approval on the spot, and what the till says when the server refused an
// approval; vi.ts gathers them under `vi.approval` and merges the codes into `vi.errors`.

/** A rate in basis points as a person reads it: 2000 is "20%", 1250 is "12,5%". */
export function percentOf(basisPoints: number): string {
  const whole = Math.trunc(basisPoints / 100);
  const rest = basisPoints % 100;
  if (rest === 0) return `${whole}%`;
  return `${whole},${String(rest).padStart(2, "0").replace(/0$/, "")}%`;
}

export const VI_APPROVAL = {
  title: "Cần quản lý duyệt",
  hint: "Thao tác này vượt quyền của bạn. Người được phép làm thao tác này chọn tên mình rồi nhập mã PIN.",
  chooseApprover: "Ai duyệt?",
  noApprover: "Chi nhánh không có ai khác để duyệt. Thêm quản lý ở trang quản lý.",
  pinFor: (name: string) => `Mã PIN của ${name}`,
  approve: "Duyệt",
  approving: "Đang duyệt…",
  otherApprover: "Chọn người khác",
  cancel: "Không làm nữa",
  offline:
    "Duyệt cần mạng: máy chưa kết nối được máy chủ. Kiểm tra mạng rồi thử lại, hoặc không làm thao tác này.",
  denied: "Bạn không có quyền làm thao tác này và không ai duyệt hộ được.",
  actions: {
    lineDiscountRate: (rate: string, item: string) => `Giảm ${rate} món ${item}`,
    lineDiscountAmount: (amount: string, item: string) => `Giảm ${amount} món ${item}`,
    orderDiscountRate: (rate: string) => `Giảm ${rate} toàn đơn`,
    orderDiscountAmount: (amount: string) => `Giảm ${amount} toàn đơn`,
    /** When earlier discounts already take something off: what the manager really agrees to. */
    discountInAll: (rate: string) => `tổng giảm sau lần này: ${rate}`,
    voidAfterSent: (units: number, item: string) => `Hủy ${units} ${item} đã gửi bếp`,
    refund: (amount: string, orderNo: number) => `Hoàn ${amount} cho đơn số ${orderNo}`,
    cashIn: (amount: string) => `Thu ${amount} vào két`,
    cashOut: (amount: string) => `Chi ${amount} khỏi két`,
    cashInShift: (total: string) => `két đã thu và chi trong ca, kể cả lần này: ${total}`,
    closeDifference: (difference: string) => `Đóng ca lệch ${difference} so với tiền dự kiến`,
    closeUnpaid: (orderNo: number) =>
      `Hủy đơn số ${orderNo} chưa thu tiền (đã in tạm tính hoặc đã gửi bếp)`,
  },
} as const;

export const VI_APPROVAL_ERRORS = {
  API_APPROVAL_APPROVER_NOT_PERMITTED:
    "Người này cũng không được tự làm thao tác này nên không duyệt được. Chọn người khác.",
  API_APPROVAL_SELF_APPROVAL: "Không tự duyệt cho mình được. Chọn người khác.",
  API_APPROVAL_NOT_APPROVABLE: "Thao tác này không duyệt hộ được: người có quyền phải tự làm.",
  API_STAFF_SESSION_INVALID: "Phiên đứng quầy đã hết hạn. Nhập lại mã PIN để làm tiếp.",
  SYNC_APPROVAL_REQUIRED:
    "Máy chủ cần quản lý duyệt thao tác này mà lệnh không kèm lần duyệt nào. Làm lại thao tác và nhờ quản lý nhập PIN.",
  SYNC_APPROVAL_NOT_FOUND:
    "Máy chủ không tìm thấy lần duyệt này. Làm lại thao tác và nhờ quản lý duyệt lại.",
  SYNC_APPROVAL_NOT_FOR_THIS_STAFF:
    "Lần duyệt này dành cho người khác hoặc máy khác. Làm lại thao tác và nhờ quản lý duyệt lại.",
  SYNC_APPROVAL_FOR_ANOTHER_ACTION:
    "Quản lý đã duyệt một con số khác với thao tác máy gửi (đơn vừa đổi ở máy khác?). Làm lại thao tác và nhờ quản lý duyệt lại.",
  SYNC_APPROVAL_EXPIRED:
    "Lần duyệt đã quá hạn khi thao tác được ghi. Làm lại thao tác và nhờ quản lý duyệt lại.",
  SYNC_APPROVAL_ALREADY_USED:
    "Lần duyệt này đã được dùng rồi: mỗi lần duyệt chỉ dùng cho một thao tác. Làm lại và nhờ quản lý duyệt lại.",
  SYNC_PERMISSION_DENIED: "Bạn không có quyền làm thao tác này và không ai duyệt hộ được.",
} as const;
