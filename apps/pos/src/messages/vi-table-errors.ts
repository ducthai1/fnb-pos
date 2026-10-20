// What the till says when the server refuses a command about a table or the order at one;
// vi.ts merges VI_TABLE_ERRORS into `vi.errors`. Each sentence says what happened and what
// to do next, since the cashier is standing at the table with the guests.

const TABLE_OCCUPIED = "SYNC_TABLE_OCCUPIED";
const APPROVAL_REQUIRED = "SYNC_APPROVAL_REQUIRED";

export const VI_TABLE_ERRORS = {
  SYNC_TABLE_NOT_FOUND:
    "Máy chủ không thấy bàn này ở chi nhánh của máy (bàn đã bị xóa khỏi sơ đồ). Về sơ đồ bàn rồi chọn bàn khác cho khách.",
  SYNC_TABLE_ARCHIVED:
    "Bàn này vừa được gỡ khỏi sơ đồ ở trang quản lý. Về sơ đồ bàn rồi chọn bàn khác cho khách.",
  SYNC_TABLE_OCCUPIED:
    "Máy khác vừa mở bàn này trước nên đơn bạn gọi chưa được lưu vào bàn. Về sơ đồ bàn, chạm lại vào bàn để mở đơn đang có rồi gọi thêm vào đó.",
  SYNC_TABLE_CHANGE_NEEDS_TRANSFER:
    "Đơn này vừa được chuyển sang bàn khác ở máy khác. Về sơ đồ bàn rồi mở đơn ở bàn mới.",
  SYNC_ORDER_NOT_AT_TABLE: "Đơn này không ngồi ở bàn nào nên không chuyển bàn được.",
  SYNC_LINE_LOCKED:
    "Món đã gửi bếp không bớt, đổi hay xóa được. Về sơ đồ bàn rồi mở lại bàn để thấy đơn như máy chủ đang giữ.",
  SYNC_DEVICE_ORDER_NO_TAKEN:
    "Số đơn của máy trùng với một đơn khác. Về sơ đồ bàn rồi mở lại bàn để máy cấp số mới.",
  SYNC_APPROVAL_REQUIRED:
    "Bạn chưa được tự làm thao tác này: cần quản lý duyệt. Nhờ quản lý làm giúp.",
  SYNC_PERMISSION_DENIED: "Vai trò của bạn không được làm thao tác này. Nhờ quản lý làm giúp.",
  DOMAIN_ORDER_ALREADY_PAID:
    "Đơn này đã được thanh toán (có thể ở máy khác) nên không sửa được nữa. Về sơ đồ bàn: bàn đã trống.",
  DOMAIN_ORDER_ALREADY_CANCELLED:
    "Đơn này đã bị hủy nên không sửa được nữa. Về sơ đồ bàn rồi mở bàn để gọi đơn mới.",
  DOMAIN_ORDER_ALREADY_POSTED: "Đơn này đã chốt sổ nên không sửa được nữa.",
} as const;

/** The same code means something else when it answers a move to another table. */
const TRANSFER_SENTENCES: Readonly<Record<string, string>> = {
  [TABLE_OCCUPIED]:
    "Bàn muốn chuyển đến vừa có khách (máy khác mở trước) nên khách vẫn ở bàn cũ. Chọn một bàn trống khác.",
  [APPROVAL_REQUIRED]:
    "Bạn chưa được tự chuyển bàn: nhờ quản lý chuyển giúp, hoặc đăng nhập người có quyền chuyển bàn.",
};

/**
 * The sentence for a refusal of a command of `type`, null when the type has no sentence of
 * its own for the code (the code's general sentence then applies).
 */
export function commandSpecificSentence(type: string, code: string): string | null {
  if (type === "table.transfer") return TRANSFER_SENTENCES[code] ?? null;
  return null;
}
