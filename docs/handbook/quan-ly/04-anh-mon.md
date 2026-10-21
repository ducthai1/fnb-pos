---
title: Ảnh món
audience: quan-ly
screens: []
decisions:
  - D-072
tests:
  - apps/backoffice/src/components/menu/product-editor/product-photo-field.test.tsx
  - apps/backoffice/src/components/menu/product-list-photo.test.tsx
  - apps/backoffice/src/lib/media/shrink-photo.test.ts
  - apps/api/src/media/image-format.test.ts
  - apps/api/test/integration/media/product-image-upload.test.ts
  - apps/api/test/integration/media/product-photo-reaches-tills.test.ts
  - e2e/backoffice/attach-product-photo.spec.ts
  - e2e/pos/product-photo-on-the-till.spec.ts
---

# Ảnh món

## Dùng để làm gì

Gắn ảnh cho từng món để thu ngân nhận món nhanh trên máy quầy (thẻ món có ảnh) và để danh sách món trong trang quản lý dễ nhìn. Ảnh nằm trong trang sửa món (xem [Thực đơn](03-thuc-don.md)), ô **Ảnh món** ở đầu phần Thông tin chung.

![Ô ảnh món trong trang sửa món](../images/quan-ly/sua-mon.webp)

## Ai dùng, cần quyền gì

Cần quyền **Sửa menu** (cả lúc tải ảnh lên lẫn lúc lưu món).

## Các bước

1. Mở món cần gắn ảnh (**Thực đơn → Món →** bấm tên món).
2. Kéo thả ảnh vào khung **Ảnh món**, hoặc bấm **Chọn ảnh** (món đã có ảnh thì là **Đổi ảnh**).
3. Trình duyệt tự **thu nhỏ ảnh còn 800px** (cạnh dài), đổi sang WebP và **bỏ thông tin vị trí** (GPS trong ảnh điện thoại) rồi mới gửi lên. Lúc gửi hiện "Đang tải ảnh lên…".
4. Trang nhắc **"Bấm Lưu để giữ thay đổi ảnh."** — bấm **Lưu món**. Chưa lưu thì món vẫn giữ ảnh cũ.
5. Bỏ ảnh: bấm **Xóa ảnh** rồi **Lưu món**.
6. Máy quầy nhận ảnh mới ở lần đồng bộ kế tiếp.

## Luật và giới hạn

- Nhận **JPEG, PNG, WebP**. Máy chủ kiểm loại ảnh bằng nội dung file, không tin đuôi file.
- Sau khi thu nhỏ, ảnh tối đa **1 MB**; mỗi cạnh từ **16 đến 2048px**.
- Ảnh được phục vụ **không cần đăng nhập**: ai có đường dẫn đều xem được, nhưng đường dẫn chứa mã cửa hàng và mã băm nội dung nên không đoán được. Đừng dùng ảnh có thông tin riêng tư.
- Máy quầy giữ ảnh trong bộ nhớ của nó để **mất mạng vẫn hiện ảnh** đã tải trước đó.
- Ảnh cũ (đã thay hoặc đã xóa khỏi món) chưa được dọn khỏi máy chủ.

## Khi có lỗi

| Màn hình báo | Làm gì |
|---|---|
| Chỉ nhận ảnh JPEG, PNG hoặc WebP. | Chọn ảnh đúng loại (ảnh HEIC của iPhone: xuất sang JPEG trước) |
| Không đọc được ảnh này. Thử một ảnh khác. | File hỏng hoặc không phải ảnh |
| Máy chủ chỉ nhận ảnh JPEG, PNG hoặc WebP. | Như trên |
| Ảnh quá lớn (tối đa 1 MB sau khi thu nhỏ). Thử một ảnh khác. | Chọn ảnh khác |
| Kích thước ảnh không hợp lệ (mỗi cạnh từ 16 đến 2048px). | Ảnh quá nhỏ hoặc quá dài |
| Ảnh này không còn trên máy chủ. Chọn lại ảnh rồi lưu. | Chọn lại ảnh |
| Máy chủ chưa được cấu hình nơi lưu ảnh. Báo người quản trị. | Người vận hành chưa đặt `FNB_MEDIA_DIR` (xem [Đặt lên server](../van-hanh/02-dat-len-server.md)) |

## Mất mạng thì sao

Không tải ảnh lên được khi mất mạng. Máy quầy đang mất mạng vẫn hiện ảnh nó đã có.

## Chưa làm / sắp có

- Chưa cắt/chỉnh ảnh trong trang; chưa có thư viện ảnh mẫu.
- Chưa dọn ảnh không còn món nào dùng.
- Ảnh trong file Excel (cột "Hình ảnh") không được nhập.
