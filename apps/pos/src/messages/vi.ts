// Every string the POS shows. Screens read from here; none writes Vietnamese inline.

import { VI_APPROVAL, VI_APPROVAL_ERRORS } from "./vi-approval";
import { VI_CHECKOUT } from "./vi-checkout";
import { VI_HISTORY, VI_REFUND } from "./vi-history-refund";
import { VI_INVOICE } from "./vi-invoice";
import { VI_ORDER_ADJUST, VI_ORDER_ADJUST_ERRORS, VI_REASONS } from "./vi-order-adjust";
import { VI_CRASH, VI_REVOKED, VI_UPDATE } from "./vi-operations";
import { VI_ORDER_VERSION_ERRORS } from "./vi-order-version";
import { VI_RATE_LIMIT_ERRORS } from "./vi-rate-limit";
import { VI_QR_PAYMENT } from "./vi-qr-payment";
import { VI_WALLET_ERRORS, VI_WALLET_PAYMENT } from "./vi-wallet-payment";
import { VI_SALE } from "./vi-sale";
import { VI_SHELL } from "./vi-shell";
import { VI_CASH, VI_CLOSE_SHIFT, VI_SESSION, VI_SESSION_ERRORS } from "./vi-shift-tools";
import { VI_SYNC_ERRORS } from "./vi-sync-errors";
import { VI_TABLE_ERRORS, commandSpecificSentence } from "./vi-table-errors";
import { VI_TABLES } from "./vi-tables";
import { VI_THEME } from "./vi-theme";

export const vi = {
  boot: {
    opening: "Đang mở máy bán hàng…",
    openInAnotherTab: "POS đang mở ở tab khác",
    openInAnotherTabHint: "Đóng tab kia (hoặc chuyển sang nó) rồi tải lại trang này.",
    unsupported: "Trình duyệt này không giữ được đơn khi mất mạng",
    unsupportedHint: "Hãy dùng Chrome hoặc Edge bản mới, hoặc ứng dụng POS cài trên máy.",
    failed: "Không mở được dữ liệu bán hàng trên máy",
    failedHint: "Tải lại trang. Nếu vẫn lỗi, báo cho quản lý.",
    reload: "Tải lại",
  },
  pairing: {
    title: "Ghép máy với cửa hàng",
    hint: "Nhập mã 8 ký tự hiện trong trang quản lý, mục Thiết bị.",
    codeLabel: "Mã ghép máy",
    deviceNameLabel: "Tên máy",
    revokedNotice:
      "Máy vừa được gỡ khỏi cửa hàng và đã xóa dữ liệu bán hàng cũ. Nhập mã ghép mới (trang quản lý, mục Thiết bị) để dùng lại.",
    deviceNameDefault: "Máy bán hàng",
    submit: "Ghép máy",
    submitting: "Đang ghép…",
    codeIncomplete: "Mã gồm đúng 8 ký tự (chữ và số).",
    deviceNameMissing: "Đặt tên cho máy, ví dụ “Quầy 1”.",
  },
  bootstrap: {
    loading: "Đang tải dữ liệu cửa hàng…",
    failed: "Không tải được dữ liệu cửa hàng",
    retry: "Thử lại",
  },
  staff: {
    title: "Ai đang đứng quầy?",
    noStaff: "Chi nhánh chưa có nhân viên nào. Thêm nhân viên ở trang quản lý.",
    pinTitle: "Nhập mã PIN",
    pinLabel: "Mã PIN",
    pinFor: (name: string) => `Mã PIN của ${name}`,
    pinIncomplete: "PIN gồm 4 đến 6 chữ số.",
    back: "Chọn người khác",
    clear: "Xóa",
    backspace: "Xóa số cuối",
    submit: "Vào ca",
    submitting: "Đang kiểm tra…",
  },
  sale: VI_SALE,
  checkout: VI_CHECKOUT,
  qr: VI_QR_PAYMENT,
  wallet: VI_WALLET_PAYMENT,
  invoice: VI_INVOICE,
  tables: VI_TABLES,
  approval: VI_APPROVAL,
  adjust: VI_ORDER_ADJUST,
  reasons: VI_REASONS,
  history: VI_HISTORY,
  refund: VI_REFUND,
  cash: VI_CASH,
  closeShift: VI_CLOSE_SHIFT,
  session: VI_SESSION,
  shell: VI_SHELL,
  crash: VI_CRASH,
  update: VI_UPDATE,
  revoked: VI_REVOKED,
  theme: VI_THEME,
  tools: { label: "Công cụ của máy" },
  kitchen: { commonSlip: "Phiếu chung" },
  sales: {
    title: "Bán hàng",
    signedInAs: (name: string) => `Đang đứng quầy: ${name}`,
    switchStaff: "Đổi nhân viên",
  },
  sync: {
    checking: "Đang kiểm tra kết nối",
    online: "Đang kết nối",
    offline: "Mất mạng — vẫn bán được",
    serverError: "Máy chủ đang lỗi — vẫn bán được",
    allSynced: "Đã đồng bộ hết",
    pending: (count: number) => `Chưa đồng bộ ${count} lệnh`,
    needsAttention: (count: number) => `Cần xử lý (${count})`,
  },
  needsAttention: {
    title: "Cần xử lý",
    hint: "Máy chủ đã từ chối các lệnh dưới đây. Quản lý cần xem lại từng lệnh.",
    empty: "Không có lệnh nào bị từ chối.",
    back: "Quay lại bán hàng",
    openShiftFirst:
      "Máy chưa mở ca. Mở ca xong, đơn được đóng ngay bằng QR khách đã chuyển, tiền vào ca vừa mở.",
    backToList: "Quay lại danh sách",
    commandLine: (command: string, code: string) => `${command} — ${code}`,
    redo: "Lưu lại trên bản mới của đơn",
    open: "Mở đơn / bàn",
    openForApproval: "Mở đơn, xin duyệt rồi gửi lại",
    dismiss: "Bỏ qua lệnh này…",
    working: "Đang làm…",
    notes: {
      nothingToAdd: "Máy chủ đã có đủ các món này, lệnh được gỡ khỏi danh sách.",
      notDraft:
        "Đơn đã được trả hoặc hủy ở máy khác nên không lưu thêm món được. Mở đơn mới cho các món cần, hoặc bỏ qua lệnh và ghi lý do.",
      noCopy: "Chưa nhận được bản mới của đơn từ máy chủ. Có mạng rồi thử lại.",
      failed: "Chưa làm được. Thử lại, hoặc báo quản lý.",
    },
    dismissal: {
      title: "Bỏ qua lệnh bị từ chối",
      hint: "Lệnh rời khỏi danh sách và không được gửi lại. Máy chủ ghi lại ai bỏ qua, lệnh nào và vì sao.",
      risky:
        "Lệnh này có tiền hoặc phiếu bếp. Chỉ bỏ qua khi khoản đó đã được xử lý cách khác, và ghi rõ đã xử lý ra sao.",
      noteLabel: "Đã xử lý ra sao",
      noteRequired: "Ghi vài chữ: tiền hoặc món này đã được xử lý thế nào.",
      confirm: "Bỏ qua lệnh",
      back: "Quay lại danh sách",
    },
  },
  errors: {
    API_DEVICE_PAIRING_CODE_INVALID:
      "Mã không đúng, đã hết hạn hoặc đã được dùng. Xin mã mới ở trang quản lý.",
    API_DEVICE_UNAUTHENTICATED: "Máy này không còn được ghép với cửa hàng.",
    API_STAFF_PIN_INVALID: "Mã PIN không đúng.",
    API_STAFF_PIN_LOCKED: "Nhập sai PIN quá nhiều lần. Thử lại sau ít phút.",
    API_STAFF_NOT_FOUND: "Không tìm thấy nhân viên này. Tải lại danh sách.",
    API_STAFF_NOT_IN_BRANCH: "Nhân viên này không làm ở chi nhánh của máy.",
    API_INVALID_REQUEST: "Thông tin gửi đi không hợp lệ.",
    ...VI_SYNC_ERRORS,
    ...VI_TABLE_ERRORS,
    ...VI_ORDER_VERSION_ERRORS,
    ...VI_RATE_LIMIT_ERRORS,
    ...VI_APPROVAL_ERRORS,
    ...VI_ORDER_ADJUST_ERRORS,
    ...VI_SESSION_ERRORS,
    ...VI_WALLET_ERRORS,
    pinLockedUntil: (time: string) => `Nhập sai PIN quá nhiều lần. Thử lại lúc ${time}.`,
    network: "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.",
    unknown: "Có lỗi xảy ra. Thử lại sau ít phút.",
  },
} as const;

type ErrorCatalog = typeof vi.errors;
type CodedMessage = {
  [K in keyof ErrorCatalog]: ErrorCatalog[K] extends string ? K : never;
}[keyof ErrorCatalog];

/** The sentence for a server error code; codes this POS does not know get the generic one. */
export function messageForCode(code: string | null): string {
  if (code !== null && code in vi.errors) {
    const message = vi.errors[code as CodedMessage];
    if (typeof message === "string") return message;
  }
  return vi.errors.unknown;
}

/** The sentence for a refused command: its own for the command when it has one, else the code's. */
export function refusalSentence(type: string, code: string): string {
  return commandSpecificSentence(type, code) ?? messageForCode(code);
}
