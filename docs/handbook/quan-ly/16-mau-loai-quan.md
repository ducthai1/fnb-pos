---
title: Mẫu loại quán — khởi tạo chi nhánh theo kiểu quán
audience: chu-quan
screens:
  - /settings/templates
decisions:
  - D-119
  - D-138
  - D-138
tests:
  - packages/shop-templates/src/apply-template-is-idempotent.test.ts
  - packages/shop-templates/src/plan-template.test.ts
  - apps/api/test/integration/shop-templates/apply-shop-template.test.ts
  - apps/backoffice/src/components/shop-templates/shop-templates-screen.test.tsx
  - e2e/backoffice/apply-shop-template.spec.ts
---

# Mẫu loại quán — khởi tạo chi nhánh theo kiểu quán

## Dùng để làm gì

Quán mới không phải dựng từng thứ: chọn **kiểu quán** (cà phê, trà sữa, quán ăn, quán bar, tiệm bánh) và hệ thống **thêm sẵn** cho chi nhánh đang xem các **danh mục** thực đơn hay gặp, các **trạm pha chế/bếp** và các **công tắc** hợp kiểu quán đó (ví dụ quán ăn: bật Quản lý bàn, tắt trả tiền trước, bật ra món theo lượt). Sau đó bạn vẫn sửa, thêm, bớt tự do.

Mẫu **chỉ thêm cái còn thiếu**: không xóa, không đổi tên, không đổi giá trị bạn đã đặt. Áp lần nữa cũng không thêm trùng.

## Ai dùng, cần quyền gì

Cần **cả hai** quyền **Sửa menu** (vì mẫu thêm danh mục và trạm) và **Cài đặt cửa hàng** (vì mẫu đặt công tắc). Thiếu một trong hai thì máy chủ từ chối với câu "Vai trò của bạn không có quyền làm việc này. Nhờ chủ quán cấp quyền." Vai trò mẫu có đủ hai quyền: **Chủ quán**.

## Các bước

![Mẫu loại quán](../images/quan-ly/mau-loai-quan.webp)

1. Chọn chi nhánh ở thanh trên, mở **Cửa hàng → Mẫu loại quán**.
2. Ở **Chọn kiểu quán**, bấm một thẻ: mỗi thẻ ghi cách quán bán và số danh mục, số trạm mẫu có.
3. Trang hiện **Mẫu “…” sẽ làm gì ở chi nhánh …** theo đúng tình trạng chi nhánh lúc này:
   - **Sẽ thêm**: các danh mục, các trạm, các công tắc sẽ được đặt ("Bật “Quản lý bàn”", "Bật “Chia phiếu theo trạm pha chế/bếp”").
   - **Giữ nguyên**: các công tắc mẫu muốn đặt khác nhưng chi nhánh giữ như bạn đã chọn, và công tắc **Quầy trả tiền trước** (luôn bật, mẫu quán ăn / quán bar muốn tắt nhưng máy quầy chưa làm được kiểu gửi bếp trước khi trả).
4. Bấm **Áp dụng cho …**, đọc câu xác nhận, bấm **Áp mẫu**. Trang báo "Đã thêm 5 danh mục, 2 trạm, 3 công tắc." rồi xem lại chi nhánh: lúc này thường là "Chi nhánh đã có đủ mọi thứ của mẫu này. Không có gì để thêm."
5. Sang [Thực đơn](03-thuc-don.md) để thêm món vào các danh mục, [Trạm pha chế/bếp](15-tram-pha-che.md) để xem các trạm, [Cài đặt](09-cai-dat.md) để xem các công tắc.

## Luật và giới hạn

- **Mỗi kiểu quán có**: 
  - **Cà phê** và **Trà sữa**: một trạm **Bar**, bật tem dán ly, chia phiếu theo trạm, không bàn, trả tiền trước ở quầy.
  - **Quán ăn**: ba trạm (**Bếp nóng**, **Bếp lạnh**, **Bar nước**), bật Quản lý bàn, Ra món theo lượt (hiện **Sắp có** ở trang Cài đặt) và chia phiếu theo trạm; Quầy trả tiền trước giữ bật.
  - **Quán bar**: hai trạm (**Quầy bar**, **Bếp**), bật Quản lý bàn và chia phiếu theo trạm; Quầy trả tiền trước giữ bật.
  - **Tiệm bánh**: hai trạm (**Quầy bánh**, **Quầy nước**), chia phiếu theo trạm, không bàn.
- **Danh mục và trạm** được so theo tên **không phân biệt hoa thường, dấu và dấu cách thừa**: bạn đã có "ca phe" thì mẫu không thêm "Cà phê". Danh mục mới xếp **sau** các danh mục đang có.
- **Công tắc** mẫu chỉ đặt khi chi nhánh **chưa ai đặt** (ở thương hiệu hay chi nhánh) và giá trị hiện tại khác điều mẫu muốn. Đã có người đặt (kể cả đặt giống mẫu) thì giữ nguyên. Mẫu đặt ở **tầng chi nhánh**, không đụng các chi nhánh khác.
- Mẫu cũng **không đặt** công tắc nào mà làm các công tắc vi phạm ràng buộc (ví dụ **Ra món theo lượt** cần **Quản lý bàn** — bạn đã tắt bàn thì mẫu quán ăn để nguyên Ra món theo lượt). Các công tắc đó hiện ở **Giữ nguyên**.
- Mẫu chỉ có các thứ hệ thống **đang có chỗ chứa**: danh mục, trạm, công tắc. Mẫu **không** thêm món, giá, nhóm tùy chọn, **giờ cắt ngày kinh doanh**, máy in, tồn kho hay công tắc **Giá theo khung giờ** (xem [Bảng giá](14-bang-gia.md) để đặt giờ vàng).
- **Quầy trả tiền trước** luôn bật nên mẫu không tắt nó: nó hiện ở **Giữ nguyên**. **Ra món theo lượt** mẫu quán ăn vẫn đặt, nhưng máy quầy chưa làm theo (trang [Cài đặt](09-cai-dat.md) ghi **Sắp có**): giá trị được lưu, máy quầy làm theo khi tính năng đó có. Tem dán ly và chia phiếu theo trạm thì máy quầy làm theo ngay. Danh mục và trạm dùng được ngay.
- Áp mẫu cho chi nhánh có **bảng giá, món hay đơn** sẵn không làm đổi chúng.
- Hai người bấm áp cùng lúc vẫn chỉ thêm mỗi mục một lần.

## Khi có lỗi

| Màn hình báo | Làm gì |
|---|---|
| Không xem trước được. Thử lại. + lý do | Tải lại trang, chọn lại mẫu |
| Không tìm thấy mẫu này. Tải lại trang. | Tải lại trang |
| Không tìm thấy chi nhánh này. Tải lại trang. | Chọn lại chi nhánh |
| Không áp được mẫu: các công tắc của mẫu vướng luật giữa các công tắc ở một nơi khác. Chưa có gì bị thay đổi. | Xem [Cài đặt](09-cai-dat.md), chỉnh công tắc ở thương hiệu/máy rồi áp lại |
| Vai trò của bạn không có quyền làm việc này. Nhờ chủ quán cấp quyền. | Cần cả Sửa menu và Cài đặt cửa hàng |

## Mất mạng thì sao

Xem trước và áp mẫu cần mạng. Thay đổi tới máy quầy ở lần đồng bộ kế tiếp.

## Chưa làm / sắp có

- Chưa tạo được **chi nhánh mới** từ trang quản lý: mẫu áp cho chi nhánh đã có.
- Chưa có món mẫu, nhóm tùy chọn mẫu (nóng/đá, size, đường, topping), bán thành phẩm theo mẻ, quy đổi chai → ml, lô và hạn dùng: hệ thống chưa có chỗ chứa chúng.
- Chưa có **giờ cắt ngày kinh doanh** theo kiểu quán (quán bar thường cắt 6 giờ sáng); giờ này là 4 giờ sáng cho mọi chi nhánh.
- Chưa áp lại để **trả về** như mẫu: mẫu không bao giờ ghi đè.
