---
title: Bán tại quầy — chọn món, tùy chọn, ghi chú, tìm món, phím tắt
audience:
  - thu-ngan
  - pha-che
screens:
  - sale
  - sale-photos
  - sale-long-cart
  - modifier-picker
  - modifier-picker-photo
decisions:
  - D-009
  - D-020
  - D-027
  - D-048
  - D-072
  - D-073
  - D-074
  - D-075
  - D-099
tests:
  - apps/pos/src/app/counter-sale.test.tsx
  - apps/pos/src/features/menu/best-sellers.test.ts
  - apps/pos/src/screens/till/till-header.test.tsx
  - apps/pos/test/browser/sale-grid-columns-in-chrome.test.ts
  - apps/pos/src/app/menu-keeps-its-place.test.tsx
  - apps/pos/src/screens/sale/sale-screen.test.tsx
  - apps/pos/src/screens/sale/modifier-picker-screen.test.tsx
  - apps/pos/src/screens/sale/quick-notes.test.tsx
  - apps/pos/src/screens/sale/live-menu.test.tsx
  - apps/pos/src/screens/sale/product-photo-tiles.test.tsx
  - apps/pos/src/screens/sale/cart-peek.test.tsx
  - apps/pos/src/features/menu/product-availability.test.ts
  - apps/pos/src/features/menu/product-photo-cache.test.ts
  - apps/pos/src/features/order/modifier-choices.test.ts
  - apps/pos/src/features/order/price-counter-order.test.ts
  - apps/api/test/integration/sync/sync-save-draft-prices-on-the-server.test.ts
  - apps/api/test/integration/sync/sync-save-draft-refuses-sold-out-products.test.ts
  - e2e/pos/counter-sale-cash.spec.ts
  - e2e/pos/product-photo-on-the-till.spec.ts
---

# Bán tại quầy

## Dùng để làm gì

Màn bán hàng là nơi thu ngân ghi món khách gọi: chạm món, chọn size và tùy chọn (đường, đá, topping…), ghi chú, rồi bấm **Thanh toán**. Đây là màn mở ra sau khi mở ca.

![Màn bán hàng tại quầy](../images/may-quay/sale.webp)

Màn chia ba phần:

- **Bên trái**: danh mục (Tất cả, Cà phê, Trà sữa…). Mỗi danh mục có **ảnh tròn** của món đầu tiên trong danh mục có ảnh (danh mục chưa có món nào có ảnh thì hiện biểu tượng), tên và số món trong đó, ví dụ **8 món**. Danh mục đang chọn nằm trên nền nâu.
- **Giữa**: dòng **Thực đơn · 15 món · 1 hết** (số món đang hiện và số món hết), ô tìm món và các ô món: ảnh, tên (tối đa 2 dòng, dài hơn thì cắt bằng "…"), giá và nút tròn **+**. Máy quầy 1280 px hiện 5 cột món bên cạnh đơn, màn 1920 px khoảng 7 cột, máy tính bảng ít cột hơn.
  - Số tròn màu nâu ở góc trên ảnh là số ly món đó đang có trong đơn; ô món có viền nâu.
  - Nhãn **Bán chạy** ở góc dưới ảnh: tối đa ba món máy này bán được nhiều nhất (mỗi món từ 5 ly trở lên), tính trên các đơn **đã thanh toán** máy đang giữ; nhãn cập nhật khoảng 20 giây sau khi có đơn mới.
  - Món hết: ảnh xám, con dấu **Hết món** trên ảnh, giá gạch ngang.
- **Bên phải**: đơn đang bán, trình bày như một tờ phiếu — số đơn và số gọi, **Mang đi / Tại chỗ**, các món (mỗi món một dòng), tổng tiền, **Giảm giá đơn**, **Hủy đơn** và nút **Thanh toán** (máy từ 1280 px ghi luôn số tiền cần thu trên nút).

Trên cùng là một thanh: tên quán và tên máy, **Tại quầy / Bàn** (chỉ hiện khi chi nhánh bật bán theo bàn), tình trạng đồng bộ (xem [09-mat-mang-va-dong-bo.md](09-mat-mang-va-dong-bo.md)), ba công cụ **Lịch sử đơn**, **Thu/chi két**, **Đóng ca**, rồi người đang đứng quầy, ngày của ca và hai nút **Đổi nhân viên**, **Đăng xuất** (màn hẹp hơn 1600 px chỉ hiện biểu tượng của hai nút này). Máy hẹp hơn 1280 px đưa **Tại quầy / Bàn** và ba công cụ xuống hàng thứ hai của thanh.

## Ai dùng, cần quyền gì

Mọi nhân viên đã đăng nhập đều bán được. Giảm giá, hủy món đã gửi bếp… cần quyền riêng — xem [06-huy-giam-hoan-va-duyet.md](06-huy-giam-hoan-va-duyet.md).

## Các bước

1. **Chọn kiểu phục vụ**: **Mang đi** (mặc định) hoặc **Tại chỗ**. Chọn Tại chỗ thì có thêm ô **Số bàn** (ví dụ `5` hoặc `A2`) để phục vụ mang món ra đúng chỗ — ô này chỉ là ghi chú, không giữ bàn trên sơ đồ.
2. **Chạm vào món**:
   - Món **không có size, không có tùy chọn** (ví dụ chai nước): chạm là vào đơn ngay, chạm lần nữa là thêm một.
   - Món **có size hoặc tùy chọn**: máy mở màn chọn tùy chọn (bước 3).
3. **Chọn tùy chọn** trên màn của món:

   ![Chọn tùy chọn cho trà sữa](../images/may-quay/modifier-picker.webp)

   - **Size**: chọn một (giá đổi theo size).
   - Mỗi nhóm ghi rõ luật ngay dưới tên: **Bắt buộc**, **Chọn 1**, **Chọn tối đa 3**, **Chọn 1–2**… và đếm **Đã chọn 2/3**.
   - Topping cho chọn nhiều phần thì chạm nhiều lần; nút **Bớt …** để bớt một phần.
   - **Số lượng**: số ly giống hệt nhau.
   - **Ghi chú**: gõ tự do, hoặc chạm **Ghi chú nhanh**: *Ít đá · Không đá · Ít đường · Không đường · Đá riêng · Mang về riêng*. Chạm lần nữa vào cùng ghi chú nhanh là bỏ nó ra.
   - Bấm **Thêm vào đơn · 100.000 đ** (số tiền là giá của các ly đó đã gồm tùy chọn). Bấm **Quay lại** hoặc phím **Esc** để thôi.
4. **Sửa đơn** ở cột bên phải: mỗi món một dòng — nút **−** / **+** ở đầu dòng để bớt / thêm một, rồi tên món, số tiền; tùy chọn hiện thành các nhãn nhỏ dưới tên, ghi chú là nhãn vàng. Bấm nút **⋯** cuối dòng để mở thao tác của món đó (**Xóa món**, **Hủy món**, **Giảm giá** — xem [06](06-huy-giam-hoan-va-duyet.md)); dòng đang mở chuyển nền đậm hơn. Cột đơn hẹp (máy tính bảng dựng đứng, điện thoại) thì nút − / + và ⋯ nằm ở hàng dưới tên.
5. **Tìm món**: bấm vào ô tìm hoặc phím **F2**, gõ tên — **không dấu cũng được** ("tra sua" tìm ra "Trà sữa", "d" khớp cả "đ"). Máy tìm trong danh mục đang chọn; chọn **Tất cả** để tìm khắp thực đơn.
6. Bấm **Thanh toán** hoặc phím **F9** — xem [04-thanh-toan.md](04-thanh-toan.md).

### Trên điện thoại hoặc màn hẹp

Đơn thu gọn thành một thanh dưới cùng **Xem đơn · 4 món · 177.000 đ**; chạm vào để mở đơn.

| Bán hàng (360 px) | Chọn tùy chọn (360 px) |
|---|---|
| ![Bán hàng trên điện thoại](../images/may-quay/sale-360.webp) | ![Chọn tùy chọn trên điện thoại](../images/may-quay/modifier-picker-360.webp) |

### Ảnh món

- Ảnh món do quản lý tải lên ở trang quản lý; máy tự nhận khi đồng bộ.
- Món chưa có ảnh (hoặc ảnh không tải được) hiện **hai chữ cái đầu** của tên trên nền màu của danh mục, ví dụ "Cà phê sữa" → **CP**.
- Ảnh đã xem một lần được **giữ lại trên máy**, nên mất mạng vẫn thấy ảnh.

### Phím tắt

| Phím | Ở đâu | Làm gì |
|---|---|---|
| **F2** | màn bán | nhảy vào ô tìm món |
| **F9** | màn bán, màn bàn, ngăn thanh toán | mở thanh toán / hoàn tất thanh toán |
| **F8** | màn bàn | in tạm tính |
| **F10** | màn bàn | gửi bếp |
| **Esc** | màn chọn tùy chọn, ngăn kéo (thanh toán…) | đóng, quay lại |

Phím tắt chạy cả khi con trỏ đang ở trong ô nhập, trừ lúc bộ gõ tiếng Việt đang ghép chữ. Phím tắt tắt đi khi nút tương ứng đang mờ (ví dụ đơn trống thì F9 không làm gì).

## Luật và giới hạn

- Giá trên máy **đã gồm VAT** hay **cộng VAT** tùy cài đặt chi nhánh; dưới tổng có dòng **Đã gồm VAT** hoặc **VAT**, và **Phí dịch vụ** nếu chi nhánh có thu. Máy chủ **tính lại** tổng tiền của mọi đơn, không tin số máy gửi lên.
- Bảng giá theo giờ (ví dụ giờ vàng) áp theo **giờ của máy lúc bán**.
- Món **Hết món** (bật ở trang quản lý) hiện ảnh xám với con dấu **Hết món**, giá gạch ngang, không chạm được. Món **Chưa có giá** cũng không chạm được. Món hết hoặc chưa có giá không có nút **+** và không mang nhãn **Bán chạy**.
- Máy quầy **chỉ bán món giá cố định**: combo, món giá nhập tay và món bán theo cân **không hiện** trên máy quầy.
- **Đơn dài** (nhiều món): cột đơn tự cuộn, phần tổng tiền, **Giảm giá đơn**, **Hủy đơn** và **Thanh toán** luôn đứng yên ở dưới.
- Số lượng một dòng: tối đa **999**. Ghi chú: tối đa **500 ký tự**. Số bàn ghi tay: tối đa **20 ký tự**.
- Nhóm tùy chọn có giới hạn theo size (ví dụ size L được thêm nhiều topping hơn) thì máy áp đúng theo size đang chọn.
- **Số đơn** đếm riêng trên từng máy (1, 2, 3…). **Số gọi** để gọi khách lấy món là số đơn quay vòng từ **1 đến 100** (đơn 101 có số gọi 1).
- **Thực đơn nhớ chỗ đang bán**: danh mục đang chọn giữ nguyên suốt phiên (qua thanh toán, sang bàn, mở công cụ); quay lại cùng một đơn thì giữ cả chữ đang tìm và chỗ đang cuộn; sang đơn mới (khách sau) thì xóa ô tìm và cuộn về đầu, vẫn giữ danh mục.
- Món đã gửi bếp, đã giảm giá hoặc đã hủy một phần thì **không bớt / xóa** bằng nút −: phải dùng **Hủy món**.
- Đơn đang có **giảm giá toàn đơn** thì các món đang có trên đơn bị khóa sửa/xóa; gỡ giảm giá đơn trước.

## Khi có lỗi

| Máy báo | Nghĩa là | Làm gì |
|---|---|---|
| Chưa có món nào để bán. Thêm món ở trang quản lý. | Thực đơn trống | Quản lý thêm món |
| Không có món nào khớp. | Không tìm ra món | Gõ ít chữ hơn, hoặc chọn **Tất cả** |
| Chưa chọn “Đường” — mục này bắt buộc. | Bỏ trống nhóm bắt buộc | Chọn một lựa chọn trong nhóm |
| “Topping” cần chọn ít nhất 1. / “Topping” chỉ được chọn tối đa 3. | Chọn thiếu / thừa | Chọn lại cho đúng số |
| “Kem cheese” chỉ chọn được một lần. / “Trân châu đen” tối đa 2 phần mỗi món. | Chọn một lựa chọn quá số lần cho phép | Bớt đi |
| “Topping” không áp dụng cho size này. / Chọn size trước. | Nhóm không dùng cho size đang chọn / chưa chọn size | Chọn size phù hợp |
| Món này vừa đổi trên thực đơn. Đóng lại và chọn lại món. | Quản lý vừa sửa món trong lúc đang chọn | Bấm Quay lại, chạm lại món |
| Có món vừa bị gỡ khỏi thực đơn. Xóa món đó khỏi đơn rồi thanh toán. | Món trong đơn vừa bị gỡ | Xóa món đó rồi thanh toán |
| Không lưu được đơn trên máy. Thử lại; nếu vẫn lỗi, báo cho quản lý. | Máy không ghi được đơn vào bộ nhớ máy | Thử lại; tải lại trang; báo quản lý |
| Món đã gửi bếp, đã giảm giá hoặc đã hủy một phần nên không bớt, đổi hay xóa được: muốn bớt thì hủy món. … | Sửa món đã khóa | Dùng **Hủy món** |
| Tổng tiền trên máy khác tổng máy chủ tính (đơn hoặc giá vừa đổi ở nơi khác). Mở lại đơn để tính lại. | Giá vừa đổi trên máy chủ | Mở lại đơn |

## Mất mạng thì sao

Bán tại quầy **không cần mạng**: thực đơn, giá, ảnh đã có sẵn trên máy; đơn lưu vào máy và tự gửi lên khi có mạng. Món bị đổi giá hay hết món ở trang quản lý trong lúc mất mạng thì máy chỉ biết khi có mạng lại. Xem [09-mat-mang-va-dong-bo.md](09-mat-mang-va-dong-bo.md).

## Chưa làm / sắp có

- Bán **combo**, món **giá nhập tay**, món **theo cân** trên máy quầy.
- Giữ đơn (treo đơn để bán khách khác rồi quay lại) ở chế độ tại quầy — hiện mỗi máy giữ **một** đơn quầy đang bán; đơn chưa thanh toán mở lại được từ **Lịch sử đơn** (xem [08](08-lich-su-don.md)).
- Kênh giao hàng, khuyến mãi, voucher, tích điểm khách hàng.
- Tem dán ly và phiếu pha chế in ra giấy (hiện là bản xem trước — xem [10-phieu-in.md](10-phieu-in.md)).
