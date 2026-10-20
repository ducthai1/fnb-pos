// Every string the POS shows. Screens read from here; none writes Vietnamese inline.

import { VI_CHECKOUT } from "./vi-checkout";
import { VI_INVOICE } from "./vi-invoice";
import { VI_QR_PAYMENT } from "./vi-qr-payment";
import { VI_SALE } from "./vi-sale";
import { VI_SYNC_ERRORS } from "./vi-sync-errors";
import { VI_TABLE_ERRORS, commandSpecificSentence } from "./vi-table-errors";
import { VI_TABLES } from "./vi-tables";

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
    submit: "Vào ca",
    submitting: "Đang kiểm tra…",
  },
  sale: VI_SALE,
  checkout: VI_CHECKOUT,
  qr: VI_QR_PAYMENT,
  invoice: VI_INVOICE,
  tables: VI_TABLES,
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
    commandLine: (command: string, code: string) => `${command} — ${code}`,
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
