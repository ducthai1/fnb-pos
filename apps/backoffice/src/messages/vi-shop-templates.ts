// The shop template page: pick a kind of shop, see what it adds to the branch, apply it.

export const VI_SHOP_TEMPLATES = {
  title: "Mẫu loại quán",
  hint: "Khởi tạo nhanh chi nhánh đang xem theo kiểu quán: danh mục, trạm pha chế/bếp và công tắc phù hợp. Mẫu chỉ thêm cái còn thiếu, không xóa hay đổi gì bạn đã làm.",
  chooseBranch: "Chọn chi nhánh để áp mẫu.",
  pickTitle: "Chọn kiểu quán",
  pickLabel: "Kiểu quán",
  includes: (categories: number, stations: number) => `${categories} danh mục · ${stations} trạm`,
  previewTitle: (template: string, branch: string) => `Mẫu “${template}” sẽ làm gì ở chi nhánh ${branch}`,
  loadingPreview: "Đang xem chi nhánh…",
  previewFailed: "Không xem trước được. Thử lại.",
  adds: "Sẽ thêm",
  addsCategories: (count: number) => `Danh mục (${count})`,
  addsStations: (count: number) => `Trạm pha chế/bếp (${count})`,
  addsFlags: (count: number) => `Công tắc (${count})`,
  flagOn: (name: string) => `Bật “${name}”`,
  flagOff: (name: string) => `Tắt “${name}”`,
  keeps: "Giữ nguyên",
  keepsHint: "Các công tắc này mẫu muốn đặt khác, nhưng chi nhánh giữ như bạn đã chọn.",
  keptChosen: (name: string, current: boolean, wanted: boolean) =>
    `“${name}” đang ${current ? "bật" : "tắt"} do bạn đặt (mẫu muốn ${wanted ? "bật" : "tắt"}).`,
  keptRule: (name: string, current: boolean, wanted: boolean) =>
    `“${name}” đang ${current ? "bật" : "tắt"}: mẫu muốn ${wanted ? "bật" : "tắt"} nhưng sẽ vướng luật giữa các công tắc.`,
  keptLocked: (name: string) =>
    `“${name}” luôn bật vì máy quầy chưa làm được kiểu gửi bếp trước khi trả, nên mẫu không tắt được (sắp có).`,
  nothing: "Chi nhánh đã có đủ mọi thứ của mẫu này. Không có gì để thêm.",
  apply: (branch: string) => `Áp dụng cho ${branch}`,
  confirmTitle: (template: string, branch: string) => `Áp mẫu “${template}” cho chi nhánh ${branch}?`,
  confirmHint: "Chỉ thêm các mục ở trên. Danh mục và trạm đã có, công tắc bạn đã đặt, món và giá đều giữ nguyên. Áp lần nữa cũng không thêm trùng.",
  confirm: "Áp mẫu",
  applying: "Đang áp mẫu…",
  applied: (categories: number, stations: number, flags: number) => {
    const parts = [
      categories > 0 ? `${categories} danh mục` : null,
      stations > 0 ? `${stations} trạm` : null,
      flags > 0 ? `${flags} công tắc` : null,
    ].filter((part) => part !== null);
    return parts.length === 0 ? "Chi nhánh đã có đủ, không thêm gì." : `Đã thêm ${parts.join(", ")}.`;
  },
  templatesFailed: "Không tải được danh sách mẫu.",
} as const;
