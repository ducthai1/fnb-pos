// Serving at tables: the floor, an order at a table, moving guests; vi.ts gathers them
// under `vi.tables`.

export const VI_TABLES = {
  modes: {
    label: "Chế độ bán",
    counter: "Tại quầy",
    tables: "Bàn",
  },
  floor: {
    title: "Sơ đồ bàn",
    areasLabel: "Khu vực",
    loading: "Đang tải sơ đồ bàn…",
    loadFailed: "Không tải được sơ đồ bàn. Kiểm tra mạng; máy sẽ tự thử lại.",
    noPlan: "Chi nhánh chưa có bàn nào. Thêm khu và bàn ở trang quản lý, mục Sơ đồ bàn.",
    emptyArea: "Khu này chưa có bàn.",
    emptyAreaHint: "Thêm bàn cho khu này ở trang quản lý, mục Sơ đồ bàn.",
    legendLabel: "Chú thích trạng thái bàn",
    filterLabel: "Lọc bàn",
    filters: { all: "Tất cả", seated: "Có khách", free: "Bàn trống" },
    viewLabel: "Cách xem",
    views: { plan: "Sơ đồ", grid: "Lưới" },
    noneShown: "Không có bàn nào khớp bộ lọc.",
    noneShownHint: "Chọn “Tất cả” để xem mọi bàn của khu.",
    seats: (count: number) => `${count} chỗ`,
    status: {
      free: "Trống",
      occupied: "Có khách",
      awaiting_payment: "Đã in tạm tính",
      changed_after_pre_bill: "Đã đổi sau tạm tính",
    },
    seatedFor: (duration: string) => `Ngồi ${duration}`,
    justOpened: "Vừa mở",
    minutes: (count: number) => `${count} phút`,
    hours: (hours: number, minutes: number) =>
      minutes === 0 ? `${hours} giờ` : `${hours} giờ ${minutes} phút`,
    orderNotOnTill:
      "Đơn của bàn này chưa về máy. Chờ máy đồng bộ (vài giây khi có mạng) rồi chạm lại vào bàn.",
    moved: (from: string, to: string) => `Đã chuyển khách từ bàn ${from} sang bàn ${to}.`,
  },
  order: {
    title: (table: string) => `Bàn ${table}`,
    tableLabel: (table: string) => `Bàn ${table}`,
    sent: "Đã gửi bếp",
    unsent: "Chưa gửi bếp",
    sendToKitchen: (count: number) => `Gửi bếp (${count} món)`,
    nothingToSend: "Đã gửi bếp hết",
    preBill: "In tạm tính",
    pay: "Thanh toán",
    transfer: "Chuyển bàn",
    release: "Trả bàn",
    backToFloor: "Về sơ đồ bàn",
    changedAfterPreBill:
      "Đơn đã đổi sau khi in tạm tính: phiếu tạm tính khách đang cầm không còn đúng. In tạm tính lại trước khi thu tiền.",
    preBillCurrent: "Đã in tạm tính — đang chờ khách thanh toán.",
    leaveTitle: "Còn món chưa gửi bếp",
    leaveHint: (count: number) =>
      `Có ${count} món chưa gửi bếp. Rời đi bây giờ thì bếp chưa biết để làm món.`,
    stay: "Ở lại gửi bếp",
    leaveAnyway: "Vẫn rời",
    blocked: "Đơn này không lưu được nữa. Về sơ đồ bàn rồi mở lại bàn.",
  },
  slips: {
    /** Printed at the top of the pre-bill in place of the bill's own title. */
    preBillHeading: "PHIẾU TẠM TÍNH",
    kitchenTitle: "Phiếu bếp vừa gửi",
    preBillTitle: "Phiếu tạm tính",
    backToOrder: "Quay lại đơn",
    noKitchenSlip: "Không có món nào cần gửi bếp.",
  },
  transfer: {
    title: (table: string) => `Chuyển khách bàn ${table}`,
    hint: "Chọn một bàn trống. Món đã gửi bếp đi theo khách, không in lại.",
    occupied: (table: string) =>
      `Bàn ${table} đang có khách. Máy chưa gộp được hai bàn: chọn một bàn trống, hoặc thanh toán riêng từng bàn.`,
    noFreeTable: "Không còn bàn trống nào ở chi nhánh.",
    back: "Quay lại đơn",
  },
} as const;
