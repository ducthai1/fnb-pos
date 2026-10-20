// What the till says when an order moved on at another till under the change it was
// saving; vi.ts merges these into `vi.errors`, keyed by the code the server answers with.

export const VI_ORDER_VERSION_ERRORS = {
  SYNC_ORDER_VERSION_STALE: "Máy khác vừa sửa bàn này — đã cập nhật, kiểm lại món rồi lưu.",
} as const;
