// The order history of the day and refunds; vi.ts gathers them under `vi.history` and
// `vi.refund`.

import { formatBusinessDate } from "@fnb/domain";

export const VI_HISTORY = {
  title: "Lịch sử đơn",
  open: "Lịch sử đơn",
  day: (date: string) => `Ngày ${formatBusinessDate(date)}`,
  search: "Tìm theo số đơn",
  filters: {
    all: "Tất cả",
    draft: "Nháp",
    paid: "Đã trả",
    cancelled: "Đã hủy",
    refunded: "Đã hoàn",
  },
  empty: "Không có đơn nào khớp.",
  orderLine: (no: number) => `Đơn số ${no}`,
  where: { takeaway: "Mang đi", table: (name: string) => `Bàn ${name}` },
  otherTill: "Máy khác",
  refunded: (amount: string) => `Đã hoàn ${amount}`,
  reopen: (no: number) => `Mở lại đơn số ${no}`,
  reopenAtTable: "Mở ở sơ đồ bàn",
  refund: (no: number) => `Hoàn tiền đơn số ${no}`,
  reprint: (no: number) => `In lại hóa đơn số ${no}`,
  reprintTitle: "In lại hóa đơn",
  back: "Về bán hàng",
  tableLabel: "Đơn trong ngày",
  columns: {
    time: "Giờ",
    number: "Số",
    where: "Bàn/Mang đi",
    status: "Trạng thái",
    total: "Tổng",
  },
  openOrder: (no: number) => `Xem đơn số ${no}`,
  openedAt: "Mở lúc",
  paidAt: "Trả lúc",
  total: "Tổng",
  close: "Đóng, về lịch sử đơn",
  emptyHint: "Đổi bộ lọc về “Tất cả” hoặc xóa số đang tìm.",
} as const;

export const VI_REFUND = {
  title: (no: number) => `Hoàn tiền đơn số ${no}`,
  hint: "Chọn món và số lượng khách trả lại. Số tiền hoàn do hệ thống tính theo đúng giá đã bán (đã trừ giảm giá).",
  line: (sold: number, left: number) => `Đã bán ${sold} · còn hoàn được ${left}`,
  units: (name: string) => `Số lượng hoàn ${name}`,
  nothingChosen: "Chọn ít nhất một món để hoàn.",
  amount: (amount: string) => `Hoàn cho khách: ${amount}`,
  method: "Hoàn bằng",
  methods: {
    cash: "Tiền mặt từ két",
    bank_transfer: "Chuyển khoản",
  },
  transferNote:
    "Chuyển khoản lại cho khách từ tài khoản cửa hàng: máy chỉ ghi lại, không chuyển tiền giúp, và két không đổi.",
  cashNote: "Lấy tiền từ két của ca đang mở: tiền dự kiến của ca giảm đúng số này.",
  confirm: (amount: string) => `Hoàn ${amount}`,
  doneTitle: "Đã hoàn tiền",
  done: (amount: string, no: number) => `Đã hoàn ${amount} cho đơn số ${no}.`,
  slipHeading: "PHIẾU HOÀN TIỀN",
  slipFooter: (no: number) => `Hoàn cho đơn số ${no}`,
  backToHistory: "Về lịch sử đơn",
  nothingLeft: "Đơn này đã hoàn hết.",
} as const;
