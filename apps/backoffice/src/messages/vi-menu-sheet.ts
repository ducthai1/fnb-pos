// Importing the menu from an .xlsx products sheet and exporting it in the same layout.

/**
 * The columns of the products sheet other POS tools in Vietnam export, in their order. The
 * export writes exactly these, so a sheet goes back and forth between them and this menu.
 */
export const VI_MENU_SHEET_COLUMNS = [
  "Mã hàng hóa",
  "Tên hàng hóa",
  "Tên nhóm",
  "ĐVT",
  "ĐVT Lớn",
  "Mã ĐVT Lớn",
  "Giá trị quy đổi",
  "Giá bán",
  "Giá bán ĐVT Lớn",
  "Giá vốn",
  "Tồn kho",
  "Thuộc tính",
  "Hình ảnh",
  "Ghi chú nhanh khi bán hàng (Ghi chú 1, Ghi chú 2,...)",
  "Định mức tồn nhỏ nhất",
  "Định mức tồn lớn nhất",
  "Loại hàng",
  "Không cho phép bán?",
  "Tách thành nhiều dòng khi bán hàng",
  "Tên máy in?",
  "Mã nhà cung cấp",
  "VAT",
  "Tỷ lệ % tính thuế GTGT và TNCN theo ngành nghề",
  "Được giảm trừ 20% mức tỉ lệ % tính thuế theo doanh thu",
] as const;

export const VI_MENU_IMPORT = {
  title: "Nhập món từ Excel",
  open: "Nhập từ Excel",
  export: "Xuất Excel",
  exportFile: (day: string) => `thuc-don-${day}.xlsx`,
  sheetName: "Thực đơn",
  hint: "Chuyển menu từ phần mềm bán hàng khác: tải file Excel danh sách hàng hóa, xem trước từng dòng rồi mới nhập.",
  fileLabel: "File Excel (.xlsx)",
  fileHint:
    "Dùng các cột Mã hàng hóa, Tên hàng hóa, Tên nhóm, Giá bán, VAT và Không cho phép bán?. File xuất từ trang Món có đúng các cột này.",
  choose: "Chọn file",
  dropHint: "hoặc kéo thả file vào khung này",
  reading: "Đang đọc file…",
  unreadable: "Không đọc được file. Hãy chọn file .xlsx (Excel 2007 trở lên).",
  tooBig: "File quá lớn (tối đa 5.000 dòng).",
  noNameColumn: "Không thấy cột “Tên hàng hóa” ở dòng tiêu đề.",
  noRows: "File không có dòng hàng hóa nào.",
  fileRead: (name: string, rows: number) => `${name}: ${rows} dòng hàng hóa.`,
  ignoredTitle: "Cột bỏ qua",
  ignored: (columns: string) =>
    `Các cột này không nhập vào menu: ${columns}. Món không có tồn kho, giá vốn hay đơn vị lớn.`,
  categoryLabel: "Danh mục cho món mới",
  categoryByGroup: "Theo cột “Tên nhóm” (tạo danh mục chưa có)",
  categoryNone: "Không thuộc danh mục",
  kindLabel: "Loại của món mới",
  previewLabel: "Các dòng trong file",
  search: "Tìm theo tên hoặc mã",
  columns: {
    line: "Dòng",
    code: "Mã",
    name: "Tên món",
    category: "Danh mục",
    price: "Giá bán",
    status: "Kết quả",
  },
  newCategory: (name: string) => `${name} (tạo mới)`,
  noCategory: "—",
  status: {
    new: "Món mới",
    update: "Cập nhật",
    same: "Đã có, không đổi",
    skipped: "Bỏ qua",
    error: "Lỗi",
    imported: "Đã nhập",
    failed: "Không nhập được",
  },
  filters: {
    new: "Món mới",
    update: "Cập nhật",
    same: "Không đổi",
    skipped: "Bỏ qua",
    error: "Lỗi",
  },
  changes: { price: (price: string) => `Giá thành ${price}`, category: "Đổi danh mục" },
  duplicateCode: (line: number) => `Trùng mã với dòng ${line}.`,
  duplicateName: (line: number) => `Trùng tên với dòng ${line}.`,
  notForSale: "Đang ghi “Không cho phép bán”.",
  notFixedPrice: "Món đang có cách tính giá khác giá cố định: sửa trong trang món.",
  matchHint:
    "Món trùng tên (không phân biệt hoa thường) với món đã có thì cập nhật giá và danh mục; nhập lại cùng file không tạo món đôi.",
  start: (count: number) => `Nhập ${count} món`,
  willWrite: (created: number, updated: number) =>
    `Sẽ tạo ${created} món mới và cập nhật ${updated} món. Dòng lỗi và dòng bỏ qua không được nhập.`,
  nothingToImport: "Không có dòng nào để nhập.",
  stop: "Dừng",
  progress: (done: number, total: number) => `Đã xử lý ${done}/${total} món`,
  finished: (imported: number, failed: number) =>
    failed === 0
      ? `Đã nhập ${imported} món.`
      : `Đã nhập ${imported} món, ${failed} món không nhập được.`,
  stopped: (imported: number) => `Đã dừng. Đã nhập ${imported} món; nhập lại để làm tiếp.`,
  categoryFailed: (name: string) => `Không tạo được danh mục “${name}”.`,
  back: "Về danh sách món",
  empty: "Chọn một file để xem trước.",
  noMatch: "Không có dòng nào khớp.",
} as const;
