// The product photo field of the editor, and the API's refusals of a photo.

export const VI_MENU_PHOTO = {
  label: "Ảnh món",
  hint: "Kéo thả ảnh vào đây hoặc chọn file (JPEG, PNG, WebP). Ảnh được thu nhỏ còn 800px và bỏ thông tin vị trí trước khi gửi.",
  choose: "Chọn ảnh",
  change: "Đổi ảnh",
  remove: "Xóa ảnh",
  uploading: "Đang tải ảnh lên…",
  preview: (name: string) => `Ảnh của ${name || "món"}`,
  saveToKeep: "Bấm Lưu để giữ thay đổi ảnh.",
  notAPhoto: "Chỉ nhận ảnh JPEG, PNG hoặc WebP.",
  unreadable: "Không đọc được ảnh này. Thử một ảnh khác.",
} as const;

export const VI_MEDIA_ERRORS = {
  API_MEDIA_UNSUPPORTED_TYPE: "Máy chủ chỉ nhận ảnh JPEG, PNG hoặc WebP.",
  API_MEDIA_TOO_LARGE: "Ảnh quá lớn (tối đa 1 MB sau khi thu nhỏ). Thử một ảnh khác.",
  API_MEDIA_DIMENSIONS_NOT_ALLOWED: "Kích thước ảnh không hợp lệ (mỗi cạnh từ 16 đến 2048px).",
  API_MEDIA_NOT_CONFIGURED: "Máy chủ chưa được cấu hình nơi lưu ảnh. Báo người quản trị.",
  API_CATALOG_IMAGE_NOT_FOUND: "Ảnh này không còn trên máy chủ. Chọn lại ảnh rồi lưu.",
} as const;
