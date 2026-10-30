// Voids, discounts, cancelling a draft and refunds; vi.ts gathers them under `vi.adjust` and
// merges the codes into `vi.errors`.

import type { ReasonCode } from "../features/order-adjust/reason-codes";

export const VI_REASONS: Readonly<Record<ReasonCode, string>> = {
  customer_changed_mind: "Khách đổi ý",
  wrong_item: "Nhập nhầm món",
  made_wrong: "Pha/làm sai món",
  out_of_stock: "Hết nguyên liệu",
  customer_left: "Khách không mua nữa",
  duplicate_order: "Đơn bị trùng",
  test_order: "Đơn thử",
  customer_returned: "Khách trả lại món",
  quality_issue: "Món không đạt",
  overcharged: "Tính tiền nhầm",
  table_emptied: "Bàn không còn món nào",
  handled_by_hand: "Đã xử lý cách khác",
  no_longer_needed: "Không còn cần nữa",
  other: "Lý do khác",
};

export const VI_ORDER_ADJUST = {
  reason: "Lý do",
  reasonNote: "Ghi chú lý do",
  reasonNoteHint: "Ví dụ: khách làm đổ ly, gọi nhầm quán",
  reasonNoteRequired: "Chọn “Lý do khác” thì phải ghi vài chữ chuyện gì đã xảy ra.",
  reasonNoteCount: (written: number, most: number) => `${written}/${most} ký tự`,
  back: "Quay lại đơn",
  checking: "Đang đọc đơn…",
  notSaved: "Đơn chưa lưu xong trên máy (hoặc lần lưu vừa rồi lỗi). Quay lại đơn rồi thử lại.",
  tools: {
    void: (name: string) => `Hủy món ${name}`,
    discount: (name: string) => `Giảm giá món ${name}`,
    lineMenu: (name: string) => `Thao tác món ${name}`,
    voidShort: "Hủy món",
    changeOptions: (name: string) => `Đổi tùy chọn món ${name}`,
    changeOptionsShort: "Đổi tùy chọn",
    discountShort: "Giảm giá",
    orderDiscount: "Giảm giá đơn",
    cancelOrder: "Hủy đơn",
  },
  cart: {
    lineDiscount: "Giảm giá món",
    voided: (units: number) => `Đã hủy ${units} (đã gửi bếp)`,
    voidedWeighing: (grams: string) => `Đã hủy lần cân ${grams} (đã gửi bếp)`,
    orderDiscount: "Giảm giá",
  },
  void: {
    title: "Hủy món",
    left: (units: number) => `Còn ${units} trên đơn`,
    sent: (units: number) => `${units} đã gửi bếp`,
    units: "Số lượng hủy",
    confirm: (units: number) => `Hủy ${units} món`,
    leftWeighed: (grams: string) => `Còn lần cân ${grams} trên đơn`,
    sentWeighed: (grams: string) => `Lần cân ${grams} đã gửi bếp`,
    confirmWeighed: (grams: string) => `Hủy lần cân ${grams}`,
    afterSentNote: "Hủy món đã gửi bếp sẽ in phiếu hủy cho trạm làm món đó.",
    orderDiscountWouldRise:
      "Hủy món làm phần giảm giá toàn đơn lớn hơn mức bạn được tự giảm. Gỡ giảm giá đơn trước, hủy món, rồi giảm lại.",
    cancelTicketTitle: "Phiếu hủy món",
    cancelTicketOffline:
      "Phiếu hủy đã in nhưng máy chưa báo được máy chủ: khi có mạng, lần gửi bếp sau có thể in lại phiếu hủy này.",
  },
  change: {
    pickerTitle: (name: string) => `Đổi tùy chọn · ${name}`,
    pickerHint:
      "Món cũ sẽ bị hủy (in phiếu hủy cho trạm) rồi gọi lại với lựa chọn mới. Chọn xong bấm nút dưới.",
    confirm: (amount: string) => `Hủy món cũ, gọi lại · ${amount}`,
    confirmNoPrice: "Hủy món cũ, gọi lại",
    title: "Đổi tùy chọn",
    working: "Đang hủy món cũ…",
    workingHint: "Món đã gửi bếp: nếu cần, quản lý sẽ duyệt trước khi hủy.",
    failedTitle: "Chưa đổi được",
    unchanged: "Đơn giữ nguyên như cũ, món cũ vẫn còn.",
    retry: "Thử lại",
    slipsTitle: "Phiếu đổi tùy chọn",
  },
  discount: {
    titleLine: (name: string) => `Giảm giá món ${name}`,
    titleOrder: "Giảm giá toàn đơn",
    byPercent: "Theo %",
    byAmount: "Số tiền",
    percentPreset: (rate: string) => `Giảm ${rate}`,
    typedPercent: "Phần trăm giảm (0,01–100)",
    typedAmount: "Số tiền giảm (đồng)",
    unreadable:
      "Nhập số: phần trăm từ 0,01 đến 100 (tối đa hai số lẻ), hoặc số tiền chỉ gồm chữ số.",
    preview: (discount: string, due: string) => `Giảm ${discount} · còn phải trả ${due}`,
    confirm: "Áp dụng giảm giá",
    remove: "Gỡ giảm giá",
    roundsToNothing: "Mức giảm này làm tròn ra 0 ₫ trên số còn phải trả.",
  },
  cancel: {
    title: (orderNo: number) => `Hủy đơn số ${orderNo}`,
    hint: "Đơn hủy không thu tiền và không in gì thêm. Món đã gửi bếp phải hủy món (có phiếu hủy) trước.",
    confirm: "Hủy đơn này",
    done: (orderNo: number) => `Đã hủy đơn số ${orderNo}.`,
  },
  release: {
    title: (table: string) => `Trả bàn ${table}`,
    hint: "Đơn của bàn này không còn món nào. Trả bàn là đóng đơn trống để bàn hiện trống cho khách sau; không thu tiền và không in gì.",
    confirm: "Trả bàn",
    done: (table: string) => `Đã trả bàn ${table}.`,
  },
} as const;

export const VI_ORDER_ADJUST_ERRORS = {
  SYNC_REASON_NOTE_REQUIRED:
    "Chọn “Lý do khác” mà không ghi chú nên máy chủ không nhận thao tác. Làm lại và ghi vài chữ chuyện gì đã xảy ra.",
  SYNC_ORDER_HAS_SENT_ITEMS:
    "Bếp đã có món của đơn này chưa được hủy. Hủy từng món đã gửi bếp (in phiếu hủy) trước, rồi mới hủy đơn.",
  SYNC_DISCOUNT_RATE_RAISED:
    "Bớt món làm phần giảm giá toàn đơn vượt mức bạn được tự giảm. Gỡ giảm giá đơn rồi giảm lại.",
  SYNC_DISCOUNT_LINE_IDS_TOO_FEW: "Máy gửi thiếu mã dòng giảm giá. Gỡ giảm giá rồi giảm lại.",
  SYNC_DISCOUNT_LINE_NOT_FOUND:
    "Máy chủ không thấy dòng giảm giá này trên đơn (có thể đã gỡ ở máy khác).",
  SYNC_LINE_LOCKED:
    "Món đã gửi bếp, đã giảm giá hoặc đã hủy một phần nên không bớt, đổi hay xóa được: muốn bớt thì hủy món. Ở bàn: về sơ đồ bàn rồi mở lại bàn để thấy đơn như máy chủ đang giữ.",
  DOMAIN_ORDER_VOID_BLOCKED_BY_WHOLE_LINE_DISCOUNT:
    "Món đang được giảm giá: gỡ giảm giá của món trước rồi mới hủy.",
  DOMAIN_ORDER_VOID_EXCEEDS_REMAINING: "Số lượng hủy nhiều hơn số còn lại trên đơn.",
  DOMAIN_ORDER_VOID_NEEDS_APPROVAL: "Hủy món đã gửi bếp cần quản lý duyệt.",
  DOMAIN_TOTALS_DISCOUNT_ON_PARTLY_VOIDED_LINE: "Món đã hủy một phần nên không giảm giá thêm được.",
  DOMAIN_TOTALS_DISCOUNT_EXCEEDS_BASE: "Số tiền giảm lớn hơn số còn phải trả.",
  DOMAIN_TOTALS_NON_POSITIVE_DISCOUNT: "Nhập mức giảm lớn hơn 0.",
  DOMAIN_ORDER_REFUND_EMPTY: "Chọn ít nhất một món để hoàn.",
  DOMAIN_ORDER_REFUND_EXCEEDS_REMAINING: "Số lượng hoàn nhiều hơn số còn chưa hoàn của món.",
  DOMAIN_ORDER_REFUND_REQUIRES_PAID_ORDER: "Chỉ hoàn được đơn đã thanh toán.",
} as const;
