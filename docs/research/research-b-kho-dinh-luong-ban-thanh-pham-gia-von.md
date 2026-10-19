# Nghiên cứu B: Kho, định lượng, bán thành phẩm, giá vốn (F&B POS)

Trạng thái: xong B1–B9 (B4, B6 có phần thiếu nguồn, ghi rõ trong flow). Ngân sách: ~23 WebSearch, ~23 WebFetch.
Nguồn: help center chính thức + code mã nguồn mở khi tài liệu không rõ. [TL] = có trong tài liệu/code, [SL] = suy luận.

## Mục lục

- B1. Nguyên liệu & đơn vị — xong
- B2. Định lượng (recipe/BOM) — xong
- B3. Bán thành phẩm & chế biến — xong
- B4. Nhập hàng & nhà cung cấp — xong (thiếu VN, thiếu công nợ NCC)
- B5. Kiểm kê & hủy hàng — xong
- B6. Chuyển kho — xong (thiếu quy trình bếp trung tâm)
- B7. Giá vốn — xong
- B8. Cảnh báo & đề xuất — xong
- B9. Tồn âm & tự đánh dấu hết món — xong
- Khoảng trống

---

## Chi tiết các flow

### B1. Nguyên liệu & đơn vị

- **So sánh cách làm**

| Hệ thống | Cách làm |
|---|---|
| Loyverse | Mặt hàng có "Sold by" = Weight (bán theo khối lượng/thể tích) hoặc đếm cái. Đơn vị cơ sở là lít; bán 500 ml thì nhập 0,5 [TL] |
| Loyverse | Hàng ghép (composite) cho khẩu phần cố định: tạo "Bia" (nguyên liệu, tồn theo lít) rồi "Bia 0,5L" ghép với thành phần Bia 0,5 L [TL] |
| Lightspeed K-Series | Nguyên liệu phải đã là item trong Menu > Item list; không tạo item từ module Inventory [TL] |
| Lightspeed K-Series | Measurement type của item: volume / weight / units [TL] |
| Lightspeed K-Series | Đơn vị đo chọn theo từng dòng nguyên liệu trong recipe (dropdown) [TL] |
| Sapo | Tạo nguyên liệu trong "Kho hàng > Danh sách tồn kho" với đơn vị (kg, gr, túi, bó…), tồn đầu, tồn tối thiểu [TL] |
| Sapo | Đánh dấu món "Quản lý nguyên liệu" ở mặt hàng để bật định mức [TL] |
| Odoo (core) | Có quy đổi UoM khi tính giá kit (code `_get_pos_anglo_saxon_price_unit` quy đổi UoM) [TL] — chi tiết cấu hình UoM không đọc được |
| Toast | Đơn vị và recipe không tìm thấy chi tiết; có khái niệm "prep item" là mặt hàng trung gian có tồn riêng [TL] |
| KiotViet, CukCuk, iPOS, POS365 | Không tìm thấy tài liệu mô tả đơn vị/quy đổi nhiều cấp. Không điền [ghi nhận] |

- **Các bước** (mô hình chung theo Loyverse/Sapo/Lightspeed)
  1. Tạo nguyên liệu (raw) với đơn vị tính gốc — người quản lý kho, màn Kho [TL-Sapo, Lightspeed]
  2. Tạo đơn vị quy đổi/đơn vị nhập (thùng→hộp→ml) — KHÔNG tìm thấy tài liệu VN nào mô tả bước này; chỉ có Odoo core có UoM categories [SL]
  3. Gán nguyên liệu vào món/recipe với số lượng + đơn vị [TL-Lightspeed]
  4. Hàng bán thẳng (chai nước): tạo mặt hàng có "Track stock" và "available for sale" [TL-Loyverse]; nguyên liệu không bán riêng: bỏ chọn "available for sale" để không hiện trên POS [TL-Loyverse]

- **Trạng thái**: không có trạng thái riêng cho nguyên liệu. Recipe có trạng thái draft/complete (Toast) [TL].

- **Luật nghiệp vụ**
  - Nguyên liệu phải tồn tại như item trước khi vào recipe (Lightspeed) [TL]
  - Hàng ghép (composite) tối đa 3 cấp lồng nhau: Composite → Thành phần → Con → Cháu (Loyverse) [TL]
  - Bán theo thể tích: giá = giá/đơn vị × lượng quy đổi; chỉ trừ kho khi bật theo dõi tồn (Loyverse) [TL]

- **Ca khó / ngoại lệ**
  - Đơn vị nhập ≠ đơn vị dùng (mua thùng 24 lon, dùng ml): không tìm thấy hệ thống VN nào mô tả cơ chế tách đơn vị nhập/dùng; Loyverse chỉ có quy đổi theo tỷ lệ khi bán theo thể tích [TL/khoảng trống]
  - Nhập sai đơn vị làm tồn lệch cấp số — [SL] cần khóa đơn vị gốc sau khi đã có giao dịch
  - Lightspeed không cho đổi item trong Inventory: phải vào Menu [TL]

- **Quyền**: không tìm thấy thông tin phân quyền riêng cho đơn vị. [khoảng trống]

- **Ảnh hưởng dây chuyền**: đơn vị sai → định lượng sai → giá vốn sai (B7). Loyverse hiển thị giá vốn composite tự tính từ cost + quantity thành phần [TL].

- **Nguồn**
  - https://help.loyverse.com/help/how-sell-liquids
  - https://help.loyverse.com/help/how-create-composite-item
  - https://k-series-support.lightspeedhq.com/hc/en-us/articles/4407517428891 (tóm tắt qua fetch; bài con Recipes https://k-series-support.lightspeedhq.com/hc/en-us/articles/4407511552155)
  - https://www.sapo.vn/blog/quan-ly-nguyen-vat-lieu-trong-nha-hang
  - https://raw.githubusercontent.com/odoo/odoo/18.0/addons/pos_mrp/models/pos_order.py

### B2. Định lượng (recipe / BOM)

- **So sánh cách làm**

| Hệ thống | Cách làm | Thời điểm trừ kho |
|---|---|---|
| Sapo | Định lượng gắn theo món; "khi món được gọi thì kho tự trừ theo công thức định sẵn"; chỉ trừ khi đơn đạt trạng thái cấu hình sẵn [TL] | Khi gọi món / hoàn tất đơn (cấu hình) [TL] |
| Loyverse | Composite item: trừ theo số lượng khai báo của từng thành phần mỗi lần bán [TL] | Khi bán [TL] |
| Lightspeed K | Made-to-order: trừ ngay khi đơn tạo [TL]. Made-in-batches: trừ khi chạy mẻ [TL] | Tạo đơn / chạy mẻ [TL] |
| Toast | Recipe phải "complete" (không phải "draft"); mỗi lần bán menu item tự trừ theo recipe [TL]. Modifier có trong marketing "reduces ... modifiers" nhưng không có chi tiết [TL-marketing] | Khi bán, thời điểm cụ thể không nói [TL] |
| Odoo core POS | Chỉ xử lý BOM phantom (kit) khi lọc stock move; picking tạo lúc paid, hoặc lúc đóng phiên nếu bật `update_stock_at_closing` [TL code] | Paid (mặc định) hoặc đóng phiên [TL] |
| Odoo + module bên thứ ba (POS Stock BOM) | Trừ khi đóng phiên POS (quảng cáo của app) [TL-vendor] | Đóng phiên [TL-vendor] |
| Square (MarketMan) | Stock cập nhật "khi item được dùng hoặc nhận" [TL-marketing] | không rõ |
| KiotViet, CukCuk, iPOS | Có tuyên bố trừ tự động nhưng không tìm được bài hướng dẫn; CukCuk "tự động khi bán" [TL-blog] | không tìm thấy |

- **Các bước** (theo Sapo / Lightspeed / Loyverse)
  1. Tạo món và nguyên liệu đều là item (Lightspeed yêu cầu) [TL]
  2. Mở recipe của món → thêm nguyên liệu + số lượng + đơn vị [TL]
  3. Bật "Track stock" / "Quản lý nguyên liệu" cho món cần trừ [TL-Loyverse, Sapo]
  4. Chuyển recipe từ draft sang complete (Toast) [TL]
  5. Bán: POS trừ theo recipe — ở màn thu ngân/bếp [TL]

- **Trạng thái**: draft → complete (Toast) [TL]. Các trạng thái khác không tìm thấy.

- **Luật nghiệp vụ**
  - Chỉ món có recipe "complete" mới tự trừ kho (Toast) [TL]
  - Món bán có `product.type = consu` mới tạo stock move; combo/dịch vụ bị bỏ qua (Odoo code) [TL]
  - Món không quản kho: bỏ "Track stock" (Loyverse) [TL]; Odoo: chỉ type consu [TL]
  - Mỗi lần bán tồn trừ theo số lượng khai báo, không tự làm tròn (Loyverse) [TL-suy ra]

- **Theo biến thể / size**
  - Odoo: BOM lọc move theo thuộc tính biến thể (`bom_line_id` + variant attribute) [TL code] — đây là cách làm chuẩn ERP, không phải F&B POS
  - Sapo, Toast, Lightspeed: không tìm thấy mô tả cách gắn định lượng riêng theo size [khoảng trống]. [SL] Cần recipe riêng theo size hoặc hệ số nhân theo size.

- **Theo tùy chọn/topping, mức (đường 50%, ít đá)**
  - Toast: modifier có trừ nguyên liệu theo marketing, không nói cách cấu hình [TL-marketing]
  - Square (MarketMan): "complex recipes and modifiers" [TL-marketing]
  - Mức đường 50%, ít đá: KHÔNG tìm thấy tài liệu nào mô tả cấu hình hệ số. [khoảng trống]

- **Hao hụt cho phép**
  - Lightspeed: có waste event để điều chỉnh khi bỏ đi [TL]
  - Bài MISA (tóm tắt qua tìm kiếm): bếp trưởng phải tính hao hụt ở làm sạch, cắt thái, bảo quản, xử lý nhiệt khi lập định mức [TL-blog] — không phải cấu hình phần mềm
  - Hệ thống nào có "tỷ lệ hao hụt cho phép" trong recipe: không tìm thấy (Lightspeed bài Recipes nói rõ không có) [TL]

- **Ca khó / ngoại lệ**
  - Đổi định lượng, đơn cũ: không tài liệu nào mô tả. Odoo khi hoàn trả tạo dòng âm liên kết dòng gốc và dùng giá vốn dòng gốc [TL code]. [SL] Cần snapshot recipe vào dòng đơn lúc bán để hoàn/ sửa không lệch.
  - Hủy sau khi bếp đã làm: không tìm thấy quy tắc hệ thống cụ thể; Odoo refund tạo picking số lượng âm (chưa xác minh đảo kho) [TL code]
  - Mất mạng giữa chừng: không tìm thấy tài liệu

- **Quyền**: không tìm thấy quyền riêng cho sửa định lượng [khoảng trống]

- **Ảnh hưởng dây chuyền**
  - Kho: trừ theo thời điểm đã chọn ở trên (B2 là nguồn của sổ phiếu)
  - Giá vốn: recipe × giá nguyên liệu (B7) [TL Sapo, Lightspeed "plate cost"]
  - Báo cáo: "variance analysis" so định lượng lý thuyết với thực dùng (Square/MarketMan) [TL-marketing]

- **Nguồn**
  - https://www.sapo.vn/blog/top-phan-mem-quan-ly-kho-nha-hang
  - https://www.sapo.vn/blog/quan-ly-nguyen-vat-lieu-trong-nha-hang
  - https://help.loyverse.com/help/how-create-composite-item
  - https://intercom.help/toast-central/en/articles/13793466-toast-inventory-stock-depletion-australia-canada-ireland-and-uk
  - https://k-series-support.lightspeedhq.com/hc/en-us/articles/4407511552155
  - https://raw.githubusercontent.com/odoo/odoo/18.0/addons/point_of_sale/models/pos_order.py
  - https://squareup.com/gb/en/inventory-management/restaurants
  - https://pos.toasttab.com/integrations/recipe-costing

### B3. Bán thành phẩm & chế biến

- **So sánh cách làm**

| Hệ thống | Cách làm |
|---|---|
| Toast | Prep item (bán thành phẩm) có tồn riêng; khi prep item được dùng trong recipe khác, hệ thống trừ chính prep item, không trừ từng nguyên liệu thô bên trong [TL] |
| Toast | Prep item và nguyên liệu có thể ghi waste trực tiếp trong Toast Inventory [TL] |
| Lightspeed K | Produce > Batches: tạo mẻ (Create new batch), chọn món, đổi số lượng (Custom batch), Start batch hoặc Plan batch [TL]. Khi Finish batch nhập số đơn vị đã làm ra (yield); tồn cập nhật khi hoàn thành mẻ [TL] |
| Lightspeed K | Nguyên liệu trừ theo mẻ khi chạy theo lịch sản xuất; made-to-order thì trừ khi đơn tạo [TL] |
| Lightspeed K | Batch đang chạy/đã lên lịch xóa được; thao tác xóa không hoàn tác được; không thấy quy tắc hủy có ghi nhận lý do [TL] |
| Sapo / Trà sữa (blog) | Trân châu, thạch, sốt: định lượng theo nguyên liệu thô; không tìm thấy phiếu chế biến mẻ trong tài liệu Sapo đã đọc [TL-blog, không đủ] |
| Nhanh.vn | Không tìm thấy tài liệu về bán thành phẩm/công thức lồng [khoảng trống] |
| KiotViet, CukCuk, iPOS, POS365 | Không tìm thấy tài liệu phiếu sản xuất/chế biến [khoảng trống] |
| Odoo core | Kit (phantom BOM) explode thành thành phần khi bán; không có khái niệm mẻ sản xuất trong POS; sản xuất thật nằm ở module mrp [TL code] |

- **Các bước** (mô hình Lightspeed Batches)
  1. Lên lịch mẻ hoặc bắt đầu ngay (Plan / Start batch) — quản lý bếp, màn Produce [TL]
  2. Nguyên liệu trừ khi hoàn thành mẻ (theo tài liệu "stock levels update when finishing a batch") [TL]
  3. Nhập yield (số đơn vị làm ra) → Finish batch [TL]
  4. Tồn bán thành phẩm tăng theo yield; món dùng bán thành phẩm trừ prep item (Toast) [TL]

- **Trạng thái**: Planned → In progress → Finished (Lightspeed Batches; tab Planned / In progress; batch hoàn thành biến mất khỏi In progress) [TL]. Chuyển trạng thái hủy: xóa planned/in-progress [TL].

- **Luật nghiệp vụ**
  - Mẻ phải có yield khi kết thúc [TL]
  - Nguyên liệu vào mẻ trừ ở bước hoàn thành (Lightspeed nói "automatically deducted ... from the stock levels page") [TL]; thời điểm chính xác khi start không rõ [khoảng trống]
  - Hạn dùng sau chế biến: Lightspeed không đề cập [TL-không có]. Blog Sapo ghi trân châu đã nấu dùng 1–2 ngày (nguồn A) hoặc 4–5 ngày trong tủ lạnh (nguồn B) — mâu thuẫn, không dùng làm luật [TL-blog, không tin cậy]

- **Ca khó / ngoại lệ**
  - Mẻ bị hủy giữa chừng: Lightspeed chỉ có xóa, không có phiếu hủy có lý do [TL]
  - Nấu thừa/thiếu so với yield dự kiến: không tìm thấy quy tắc chênh lệch yield [khoảng trống]
  - Lồng nhiều tầng (bán thành phẩm dùng bán thành phẩm): Toast trừ prep item ở tầng trên, nhưng không có tài liệu chỉ ra có bao nhiêu tầng [TL một phần]

- **Quyền**: không tìm thấy quyền riêng cho sản xuất mẻ.

- **Ảnh hưởng dây chuyền**: mẻ là nguồn tăng tồn prep item (kho) và là đầu vào giá vốn của bán thành phẩm; Odoo kit cost lấy từ thành phần [TL code]. Bán thành phẩm không có cost riêng trong tài liệu đã đọc [khoảng trống].

- **Nguồn**
  - https://k-series-support.lightspeedhq.com/hc/en-us/articles/4407567874843 (Batches)
  - https://k-series-support.lightspeedhq.com/hc/en-us/articles/4407511020571 (About Produce)
  - https://intercom.help/toast-central/en/articles/13793466-toast-inventory-stock-depletion-australia-canada-ireland-and-uk
  - https://www.sapo.vn/blog/cach-lam-tra-sua-tran-chau-ngon (trân châu, blog)

### B4. Nhập hàng & nhà cung cấp

- **So sánh cách làm**

| Hệ thống | Cách làm |
|---|---|
| Toast Inventory | Create PO → chọn nhà cung cấp, ngày dự kiến, thêm mặt hàng; PO mới là draft. Sửa số lượng/đơn vị/giá khi draft hoặc ordered; khi received/partially received chỉ sửa được ngày dự kiến [TL] |
| Toast Inventory | Nhận hàng theo PO hoặc theo hóa đơn đều tự cập nhật tồn; điều chỉnh chiết khấu/thuế/phí trước khi đặt, lúc nhận hoặc sau nhận [TL] |
| Toast Retail | Purchasing > Purchasing & Receiving; nhân viên nhận hàng cần quyền 5.2 Inventory & Quantity [TL] |
| Loyverse Advanced Inventory | PO: chọn Supplier + Store; autofill "All items from supplier" hoặc "Low stock items from supplier"; gửi NCC, nhận hàng, lưu thông tin NCC [TL] |
| Loyverse | Không tìm thấy tài liệu nhận một phần [khoảng trống] |
| Lightspeed K | Purchase là module riêng; tạo và theo dõi đơn mua hàng [TL] (bài con Purchase không đọc được) |
| Sapo | Không tìm thấy tài liệu phiếu nhập/PO/công nợ NCC trong các bài đã đọc; Sapo có bài công bố "cập nhật giá nhập tự điều chỉnh giá vốn" (bối cảnh hải sản) [TL-blog] |
| KiotViet, CukCuk, iPOS, POS365 | Không tìm thấy tài liệu đủ để mô tả [khoảng trống] |
| Odoo core | Nhập qua PO/receipt; chi tiết không đọc [khoảng trống] |

- **Các bước** (Toast mô hình)
  1. Tạo PO (draft) — quản lý kho, Toast Web > Inventory > Orders & deliveries [TL]
  2. Gửi NCC / đặt (ordered) [TL]
  3. Nhận hàng theo PO hoặc theo hóa đơn → tồn tăng [TL]
  4. Chỉnh chiết khấu/thuế/phí [TL]

- **Trạng thái (Toast PO)**: draft → ordered → (partially) received; chỉnh sửa theo trạng thái như trên [TL]. Trạng thái hủy/đóng không tìm thấy.

- **Luật nghiệp vụ**
  - Chỉ sửa số lượng/giá khi chưa nhận (Toast) [TL]
  - Nhận một phần: Toast có "partially received" nhưng không đọc được cách nhập số nhận dở; Loyverse không tìm thấy [khoảng trống]
  - Trả hàng NCC: Sapo công thức MAC = (A − B) / C, B là giá trị hàng trả (không gồm thuế/phụ phí), C là tồn sau trả; Sapo tự tính lại giá vốn khi xuất trả [TL]

- **Giá nhập thay đổi**: Sapo nhấn mạnh chi phí nhập thay đổi theo thời điểm khiến giá vốn phức tạp; bài không nêu cơ chế giữ giá nhập theo lần nhập [TL-blog]. Lần nhập mới ảnh hưởng giá bình quân (B7).

- **Ca khó / ngoại lệ**
  - Bán trước khi nhập (tồn âm): Sapo lấy giá nhập mới cho lần âm, khi tồn dương lại mới tính bình quân [TL]
  - Trả hàng sau khi đã bán một phần: nếu không tính lại giá vốn, các lần bán sau ghi sai giá vốn (Sapo) [TL]
  - Công nợ NCC và thanh toán NCC: không tìm thấy trong nguồn nào đã đọc [khoảng trống]

- **Quyền**: Toast cần quyền 5.2 Inventory & Quantity để nhận hàng và sửa tồn [TL]. Duyệt PO: không tìm thấy.

- **Ảnh hưởng dây chuyền**: nhận hàng tăng tồn (kho) và đổi giá bình quân (giá vốn, B7); trả hàng đảo giá vốn (B7). Công nợ NCC: không rõ cách nối với kế toán.

- **Nguồn**
  - https://support.toasttab.com/en/article/Toast-Inventory-Generate-Purchase-Orders-Receive-Inventory (tóm tắt qua tìm kiếm)
  - https://support.toasttab.com/en/article/Toast-Retail-Generate-Purchase-Orders-Receive-Inventory (tóm tắt qua tìm kiếm)
  - https://loyverse.com/advanced-inventory
  - https://www.sapo.vn/blog/gia-von-hang-ban-va-cach-tinh

### B5. Kiểm kê & hủy hàng

- **So sánh cách làm**

| Hệ thống | Kiểm kê | Hủy/hao hụt |
|---|---|---|
| Toast Retail | Đếm thực tế ghi đè tồn; loại điều chỉnh: Damage, Expire, Loss, Sample, Theft, Waste, Count; Receive và Restock là nghiệp vụ tồn bình thường [TL] | Waste: Toast Web > Inventory > Waste > Log Waste → chọn mặt hàng, số lượng, lý do → Submit [TL]; lý do có danh mục, không có thì "Other" + ghi chú [TL]; Phiếu từ POS dùng lý do cấu hình theo thiết bị [TL] |
| Toast Inventory | Variance report so tồn lý thuyết với thực tế; cần ít nhất hai lần đếm thực trên hai ngày khác nhau; tính theo đếm đầu kỳ + nhập + dùng prep + waste + đếm cuối kỳ; đang beta ở Úc/Canada/Ireland/UK [TL] | Nguyên liệu và prep item bị waste tự trừ khỏi tồn [TL] |
| Loyverse Advanced Inventory | Inventory count: đối chiếu tồn dự kiến với thực tế cho tất cả/chọn lọc, hiển thị hao hụt hoặc thừa, lưu chứng từ từng lần đếm [TL] | Điều chỉnh tồn có lý do; lịch sử lọc theo lý do (bán, hoàn, v.v.) [TL]; không tìm thấy lý do hủy riêng [khoảng trống] |
| Lightspeed K | Stock count: nhập số thực tế, tồn điều chỉnh theo số đếm, xem chênh lệch (variance) và giá trị [TL] | Wastage event khi hàng bị bỏ đi [TL] |
| Lightspeed O | Sai lệch chuyển kho sửa bằng stock count hoặc wastage [TL] | — |
| Nhanh.vn | Hạn sử dụng: khai báo khi nhập kho, có ngày hết hạn và ngày cảnh báo trước; sửa phiếu nhập cập nhật ngày hạn [TL] | Không tìm thấy quy tắc hết hạn tự hủy hay phải lập phiếu hủy [khoảng trống] |
| Sapo, KiotViet, CukCuk, iPOS | Không tìm thấy mô tả đủ chi tiết [khoảng trống] | Sapo chỉ cho biết tồn cập nhật theo đơn; không có chi tiết phiếu hủy [khoảng trống] |

- **Các bước** (Toast mô hình)
  1. Kiểm kê định kỳ: đếm thực tế (Count) [TL]
  2. Đối chiếu variance report, xem chênh lệch [TL]
  3. Ghi waste khi hàng hỏng/hết hạn/đổ vỡ: Log Waste, chọn lý do [TL]
  4. Điều chỉnh tồn có lý do [TL]

- **Trạng thái**: không tìm thấy trạng thái phiếu hủy/kiểm kê (draft/confirmed) trong nguồn đã đọc [khoảng trống]. Toast: không sửa được phiếu waste tạo từ POS [TL].

- **Luật nghiệp vụ**
  - Ngày giờ của phiếu Count không sửa được; điều chỉnh có thể backdate (Toast) [TL]
  - Phiếu waste từ POS không xóa được trên waste log, "for data integrity" (Toast) [TL]
  - Hết hạn: Nhanh chỉ cảnh báo cho phiếu nhập [TL]

- **Ca khó / ngoại lệ**
  - Void đơn không gắn lý do: Supy (blog bên thứ ba) cảnh báo đơn bị void có thể bị tính là waste làm variance tăng; không phải tài liệu Toast [TL-blog]
  - Hủy món sau khi bếp đã làm: Sapo/bài tư vấn gợi ý kiểm tra cách kho xử lý; không tìm thấy quy tắc hệ thống cụ thể [khoảng trống]
  - Chênh lệch kiểm kê: Lightspeed/Loyverse ghi nhận lỗ hoặc thừa; không thấy quy tắc ngưỡng duyệt [khoảng trống]

- **Quyền**: Toast đổi tồn cần quyền 5.2 Inventory & Quantity; không tìm thấy quyền duyệt riêng cho waste [TL/khoảng trống]

- **Ảnh hưởng dây chuyền**: waste và điều chỉnh làm tồn giảm, tăng COGS (Toast gọi là điều chỉnh để tối ưu COGS) [TL]; variance phản ánh mất mát (B7, báo cáo variance). Hủy POS và kho cần cùng lý do để không lệch variance [SL].

- **Nguồn**
  - https://support.toasttab.com/en/article/Toast-Inventory-Tracking-and-Managing-Waste-Canada-Ireland-and-UK
  - https://support.toasttab.com/en/article/Toast-Retail-Adjust-Inventory-to-Optimize-COGS-Calculations
  - https://support.toasttab.com/en/article/Toast-Inventory-Inventory-Variance-Reports-Canada-Ireland-and-UK
  - https://k-series-support.lightspeedhq.com/hc/en-us/articles/4407509542043
  - https://loyverse.com/advanced-inventory
  - https://pos.manual.nhanh.vn/pos/kho-hang/han-su-dung-sp

### B6. Chuyển kho (giữa chi nhánh, bếp trung tâm → chi nhánh)

- **So sánh cách làm**

| Hệ thống | Cách làm |
|---|---|
| Sapo | Tạo phiếu chuyển kho giữa kho/quầy/bếp/chi nhánh; in phiếu chuyển (có mặt hàng, số lượng, nơi gửi và nơi nhận) làm chứng từ giao nhận [TL, tóm tắt tìm kiếm] |
| Sapo | Phiếu ở trạng thái "đang chuyển" được hủy; được đổi chi nhánh nhận khi còn đang chuyển, không cần hủy tạo lại [TL, tóm tắt tìm kiếm] |
| Sapo | Chọn số lượng theo đơn vị quy đổi khi tạo phiếu; hệ thống đổi về đơn vị cơ sở để trừ tồn [TL, tóm tắt tìm kiếm] |
| Lightspeed O-Series | Chuyển kho chỉ giữa các site cùng Company ID; phiếu đã gửi không sửa được; sai lệch sửa bằng kiểm kê, tạo phiếu mới hoặc ghi wastage [TL, tóm tắt tìm kiếm] |
| Lightspeed K-Series | Purchase > Stock transfers; trạng thái hiển thị khác nhau cho bên gửi và bên nhận; hoàn tất phiếu tự điều chỉnh tồn hai bên [TL, tóm tắt tìm kiếm] |
| Lightspeed X (retail) | Tạo phiếu (Inventory > Stock control > Transfers), đóng gói rồi nhận bằng app scanner [TL, tóm tắt tìm kiếm] — không phải F&B |
| Toast, Loyverse, KiotViet, CukCuk, iPOS, Nhanh | Không tìm thấy tài liệu chuyển kho đủ chi tiết [khoảng trống] |

- **Các bước** (mô hình Lightspeed K + Sapo)
  1. Bên gửi tạo phiếu chuyển: chọn nơi nhận, mặt hàng, số lượng [TL]
  2. Phiếu ở trạng thái đang chuyển; tồn bên gửi giảm khi gửi/hoàn tất (thời điểm chính xác chưa rõ) [khoảng trống]
  3. Bên nhận xác nhận nhận; tồn bên nhận tăng [TL, K-Series: hoàn tất tự điều chỉnh]
  4. Sai lệch: kiểm kê hoặc tạo phiếu mới (Lightspeed O) [TL]

- **Trạng thái**: đang chuyển (Sapo) → hoàn tất (K-Series tự điều chỉnh tồn). Trạng thái cụ thể chỉ tìm thấy hai cái này [khoảng trống cho các trạng thái khác].

- **Luật nghiệp vụ**
  - Chuyển chỉ giữa các site cùng Company ID (Lightspeed O) [TL]
  - Phiếu đã gửi không sửa được (Lightspeed O) [TL]; Sapo cho phép đổi bên nhận khi còn đang chuyển [TL]
  - Phiếu đang chuyển có thể hủy (Sapo) [TL]

- **Ca khó / ngoại lệ**
  - Nhận thiếu / nhận dư: Lightspeed O không cho sửa phiếu đã gửi, phải kiểm kê hoặc tạo phiếu mới — tức là nhận thiếu là phiếu điều chỉnh riêng [TL-suy ra]. Không tìm thấy quy trình "nhận thiếu" riêng trong tài liệu nào [khoảng trống]
  - Mất mạng giữa chừng: không tìm thấy tài liệu
  - Bếp trung tâm cấp cho chi nhánh (tính giá chuyển nội bộ, bút toán nội bộ): không tìm thấy trong các nguồn đã đọc [khoảng trống]

- **Quyền**: không tìm thấy quyền riêng cho chuyển kho [khoảng trống]

- **Ảnh hưởng dây chuyền**: chuyển kho làm tồn hai nơi thay đổi (sổ phiếu kho); Lightspeed K tự điều chỉnh tồn khi hoàn tất [TL]. Giá vốn khi chuyển: không tìm thấy quy tắc [khoảng trống].

- **Nguồn**
  - https://www.sapo.vn/cap-nhat-tinh-nang/quan-ly-kho-linh-hoat-de-dang-voi-3-tinh-nang-moi-cap-nhat (tóm tắt tìm kiếm)
  - https://k-series-support.lightspeedhq.com/hc/en-us/articles/16092679490331-Stock-transfers (tóm tắt tìm kiếm)
  - https://o-series-support.lightspeedhq.com/hc/articles/31329420241307 (tóm tắt tìm kiếm)

### B7. Giá vốn

- **So sánh cách làm**

| Hệ thống | Phương pháp | Nguồn |
|---|---|---|
| Sapo | Bình quân gia quyền (MAC), được Sapo áp dụng; FIFO và LIFO được bài nêu nhưng không phải Sapo dùng [TL] | https://www.sapo.vn/blog/gia-von-hang-ban-va-cach-tinh |
| Odoo 18 | Mỗi product category chọn: Standard price (giá cố định nhập tay), Average (AVCO), FIFO [TL, blog Cybrosys — bên thứ ba] | https://cybrosys.com/blog/how-to-set-up-accurate-costing-methods-in-odoo-18 |
| Odoo POS (core) | Giá vốn kit = bình quân từ giá các thành phần, quy đổi UoM, chia theo số lượng [TL code] | https://raw.githubusercontent.com/odoo/odoo/18.0/addons/point_of_sale/models/pos_order.py (và pos_mrp) |
| Loyverse | Giá vốn composite tự tính từ cost và số lượng thành phần; phương pháp cost không tìm thấy [TL] | https://help.loyverse.com/help/how-create-composite-item |
| Toast | Có "COGS" và điều chỉnh để tối ưu COGS; phương pháp không tìm thấy [TL] | https://support.toasttab.com/en/article/Toast-Retail-Adjust-Inventory-to-Optimize-COGS-Calculations |
| Lightspeed K | Hiển thị giá trị tồn, giá vốn, số lượng; không nói AVCO hay FIFO [TL] | https://k-series-support.lightspeedhq.com/hc/en-us/articles/4407509542043 |
| Square (MarketMan) | Plate-level cost, per-dish margin, COGS, variance so sánh lý thuyết với thực tế [TL marketing] | https://squareup.com/gb/en/inventory-management/restaurants |
| KiotViet, CukCuk, iPOS, POS365, Loyverse(phương pháp) | Không tìm thấy phương pháp cụ thể [khoảng trống] | — |

- **Công thức giá vốn món** [TL Loyverse, Odoo; SL cho tổng quát]: giá vốn món = Σ(định lượng thành phần × giá vốn đơn vị thành phần). Prep item có giá vốn riêng là bình quân của mẻ — không tìm thấy tài liệu [khoảng trống].

- **Bình quân gia quyền (Sapo)**
  - Nhập: MAC = (A + B) / C — A giá trị tồn trước nhập, B giá trị nhập, C tổng số lượng sau nhập [TL]
  - Trả hàng NCC: MAC = (A − B) / C — B không gồm thuế/phụ phí [TL]

- **Bán khi chưa nhập (tồn âm)**: Sapo lấy giá nhập mới cho lượng âm; khi tồn dương lại mới tính bình quân [TL]. Odoo: không tìm thấy trong file đọc được [khoảng trống].

- **Báo cáo lãi gộp theo món**: Sapo có báo cáo lợi nhuận theo mặt hàng (số lượng bán, lợi nhuận, tỷ suất) [TL, tóm tắt tìm kiếm]; Lightspeed Restaurant có "Gross profit" và "Suggested sell price" theo markup trong recipe [TL]; Square tuyên bố có per-dish profit margins [TL marketing].

- **Ca khó / ngoại lệ**
  - Đổi giá nhập không làm đổi giá vốn đã bán — Odoo standard price: cost cố định, không đổi theo nhập [TL blog]
  - Bán trước khi nhập: như trên
  - Hoàn trả đơn: Odoo dùng giá vốn của dòng gốc khi giá vốn FIFO/AVCO bằng 0 [TL code]
  - Giá vốn bị sai khi trả hàng sau bán một phần — Sapo tự tính lại [TL]

- **Quyền**: không tìm thấy quyền riêng cho xem giá vốn [khoảng trống].

- **Ảnh hưởng dây chuyền**: giá vốn đầu vào từ nhập (B4), định lượng (B2), kiểm kê/hao hụt (B5); là nền của báo cáo lãi gộp theo món (ngoài phạm vi, thuộc báo cáo — agent khác).

- **Nguồn**: các URL trong bảng trên.

### B8. Cảnh báo & đề xuất đặt hàng

- **So sánh cách làm**

| Hệ thống | Cách làm |
|---|---|
| Toast | Par level: nhãn Low khi tồn dưới mức; Out khi tồn về 0; trang Inventory > Reorder suggestion (Purchasing); mặt hàng biến mất khi có lại hàng hoặc vượt par [TL] |
| Lightspeed K | Par level (reorder point): khi bắt đầu PO tiếp, hiện mặt hàng dưới par để đặt thêm [TL] |
| Loyverse | Low stock notification; PO autofill "Low stock items from supplier" [TL] |
| Square (MarketMan) | Par level và cảnh báo trước khi hết [TL marketing] |
| Sapo | Tồn tối thiểu khai báo khi tạo nguyên liệu; danh sách tồn cảnh báo "sắp hết", báo cáo kho có sắp hết/đã hết [TL] |
| Nhanh.vn | Hạn sử dụng: ngày cảnh báo trước khi hết hạn, chỉ áp dụng cho phiếu nhập [TL] |
| iPOS | Cảnh báo tồn kho bất thường, tồn ảo [TL, trang sản phẩm] |
| KiotViet, CukCuk, POS365 | Không tìm thấy tài liệu [khoảng trống] |

- **Các bước** (mô hình Toast)
  1. Đặt par level / tồn tối thiểu cho từng nguyên liệu [TL]
  2. Hệ thống đánh nhãn Low/Out [TL]
  3. Xem reorder suggestion, tạo PO [TL]

- **Luật nghiệp vụ**: Par level khai báo theo nguyên liệu; ngưỡng mặc định không tìm thấy [khoảng trống]

- **Quản lý lô / hạn sử dụng (tiệm bánh)**
  - Nhanh.vn: khai báo hạn khi nhập kho bằng phiếu nhập (ngày hết hạn + ngày cảnh báo trước), xem danh sách hạn, đánh dấu đã kiểm tra; cảnh báo chỉ với phiếu nhập; không rõ theo lô FEFO [TL]
  - Toast, Lightspeed, Loyverse, Sapo: không tìm thấy quản lý lô/hạn [khoảng trống]
  - Không tìm thấy hệ thống nào mô tả thứ tự bán FEFO/FIFO theo lô cho tiệm bánh [khoảng trống]
  - Odoo: không đọc được tài liệu lô/hạn [khoảng trống]

- **Ca khó / ngoại lệ**: cảnh báo hạn chỉ với phiếu nhập → nguyên liệu nhập sai/không qua phiếu sẽ không có cảnh báo [SL, suy từ Nhanh]

- **Quyền**: Square: quyền "items" để cập nhật tồn [TL]; Toast: quyền 5.2 [TL]. Duyệt PO: không tìm thấy.

- **Ảnh hưởng dây chuyền**: cảnh báo đọc từ tồn (B2, B5); đề xuất đặt hàng nối sang nhập hàng (B4).

- **Nguồn**
  - https://intercom.help/toast-central/en/articles/13793466-toast-inventory-stock-depletion-australia-canada-ireland-and-uk
  - https://k-series-support.lightspeedhq.com/hc/en-us/articles/4407509542043
  - https://pos.manual.nhanh.vn/pos/kho-hang/han-su-dung-sp
  - https://www.sapo.vn/blog/huong-dan-su-dung-sapo-fnb

### B9. Tồn âm & tự đánh dấu hết món

- **So sánh cách làm**

| Hệ thống | Hết nguyên liệu → món | Tồn âm |
|---|---|---|
| Toast | Quantity trên món; về 0 tự chuyển "Out of Stock" (86) [TL]; cấu hình: Toast Web cột Inventory, nhập 0; Quick Edit trên thiết bị [TL] | Không tìm thấy tài liệu cho phép tồn âm [khoảng trống] |
| Toast Inventory (recipe) | Stock on Hand tự giảm theo recipe; có nhãn Low và Out [TL] | Không nói rõ [khoảng trống] |
| Square | Món có stock tracking: về 0 thì tự "sold out" [TL]; món không tracking: đánh "mark as unavailable" [TL]; tự bật lại cuối ngày kinh doanh [TL]; quyền cấu hình ở Dashboard [TL] | Không tìm thấy; diễn đàn cộng đồng báo món tồn 0 vẫn bán được tại POS (không phải tài liệu chính thức) [TL cộng đồng] |
| Lightspeed K | Không tìm thấy quy tắc 86 tự động trong bài Stock management [khoảng trống] | Không đề cập [khoảng trống] |
| Odoo | Mô tả module OCA (bên thứ ba): "By default, Odoo allows negative stock"; POS core không tìm thấy cơ chế chặn bán hết hàng, chỉ các module ngoài làm [TL-bên thứ ba, chưa xác minh docs chính thức] | Cho phép mặc định [TL-bên thứ ba] |
| Sapo | Hàng bán trước khi nhập kho là nguyên nhân giá vốn sai; cách xử lý: tồn âm lấy giá nhập mới [TL] — tức Sapo cho bán âm | Cho phép [TL] |
| Loyverse, KiotViet, CukCuk, iPOS, Nhanh | Không tìm thấy [khoảng trống] | — |

- **Các bước** (Toast)
  1. Đặt Quantity cho món ở Toast Web (Inventory column) [TL]
  2. Bán → tự giảm → về 0 thì Out of Stock [TL]
  3. Hết tay không đếm: sửa tay thành Out of stock trên Quick Edit [TL]
  4. Bật lại khi nhập hàng: đánh dấu "in stock" [TL]

- **Trạng thái**: In stock ↔ Out of stock (Toast 86) [TL]; Square: sold out ↔ available (reset cuối ngày) [TL].

- **Luật nghiệp vụ**
  - Tự 86 khi tồn về 0 (Toast, Square): chỉ với món theo dõi tồn [TL]
  - Square: món theo dõi tồn trên Dashboard không đổi trạng thái bằng 86 tại POS; phải sửa số ở Dashboard [TL]
  - Square: mặc định tự bật lại cuối ngày kinh doanh (hoặc 5:00 sáng nếu không đặt giờ) [TL]
  - Toast 86 Report: liệt kê món Out of Stock và món có quantity ≤ ngưỡng [TL]

- **Ca khó / ngoại lệ**
  - Món hết tồn vẫn bán tại POS (Square cộng đồng) — dữ liệu không đồng bộ giữa Dashboard và POS [TL cộng đồng]
  - Tồn tính theo recipe lệch thực tế → món bị 86 sai hoặc vẫn bán: Toast có variance report để tìm nguyên nhân [TL]
  - Sapo cho bán âm, nên giá vốn lần bán đó dùng giá nhập mới; nếu chờ nhập mới mới bán thì giá vốn đúng hơn [TL + SL]

- **Cấu hình ở đâu**: Toast Web (Inventory column, Quick Edit), Square Dashboard (Items > Manage Stock; quyền Items) [TL]. Không tìm thấy cờ "cho phép bán khi hết" tách rõ [khoảng trống].

- **Quyền**: Square: chủ tài khoản hoặc thành viên có quyền "items" [TL]; Toast: quyền 5.2 Inventory & Quantity [TL].

- **Ảnh hưởng dây chuyền**: món bị 86 làm mất doanh thu nhưng không ảnh hưởng sổ kho; tồn âm làm sai giá vốn (B7) và cảnh báo (B8).

- **Nguồn**
  - https://support.toasttab.com/en/article/86-an-Item (tóm tắt tìm kiếm + doc.toasttab.com platformguide)
  - https://squareup.com/help/article/6425 (tóm tắt tìm kiếm + fetch)
  - https://www.sapo.vn/blog/gia-von-hang-ban-va-cach-tinh
  - https://apps.odoo.com/apps/modules/18.0/stock_no_negative (bên thứ ba)

## Khoảng trống — flow/luật không tìm được tài liệu

- **KiotViet, CukCuk, iPOS, POS365**: trang help không truy cập/không có bài FnB qua tìm kiếm (help.kiotviet.vn trả trang không nội dung; helpact.misa.vn là MISA AMIS kế toán, không phải CukCuk). Không có tài liệu nào về công thức, kho, chuyển kho, hủy, giá vốn từ 4 hệ VN này. Đây là lỗ hổng lớn nhất; cần tài khoản dùng thử hoặc hỏi nhà cung cấp.
- Quy đổi nhiều cấp (thùng → hộp → ml): không tìm thấy cấu hình ở bất kỳ hệ VN nào.
- Định lượng theo size, topping, mức đường/đá (50%, ít đá): chỉ có câu quảng cáo "modifier" (Toast, Square); không có cách cấu hình hệ số.
- Hao hụt cho phép trong recipe (% yield/waste): không có hệ nào mô tả trường này.
- Đổi định lượng thì đơn cũ tính sao: không có nguồn nào.
- Trừ kho khi gửi bếp (KDS): không rõ với Sapo, Toast, Lightspeed.
- Nhận một phần PO, công nợ NCC, thanh toán NCC, đơn trả NCC trong hệ VN: không tìm thấy (chỉ có công thức MAC trả hàng của Sapo).
- Chuyển kho bếp trung tâm → chi nhánh (giá chuyển nội bộ, nhận thiếu/dư, trạng thái): không tìm thấy quy trình đầy đủ.
- Phương pháp giá vốn của Toast, Lightspeed, Loyverse, Square: không nói rõ AVCO/FIFO.
- Hạn dùng sau chế biến, lô/FEFO cho tiệm bánh: chỉ có Nhanh (hạn theo phiếu nhập, không rõ FEFO).
- Quyền duyệt hủy/điều chỉnh/chuyển kho: không tìm thấy quyền duyệt riêng.
- Hành vi khi mất mạng giữa chừng: không tìm thấy hệ nào.
- Bán thành phẩm nhiều tầng ở hệ VN: không tìm thấy (Nhanh, Sapo, KiotViet không có tài liệu).
- Tài liệu chính thức Odoo 18 (POS, inventory, costing): search chỉ ra app bên thứ ba; đã đọc code GitHub thay thế, chưa đọc docs.

## Khác biệt giữa các loại quán (dữ liệu cho cấu hình)

Chỉ rút từ các hệ đã đọc; đa số là [SL] vì không có hệ nào mô tả theo loại quán.

- **Cafe / trà sữa**: định lượng theo ly, topping = modifier [TL-quảng cáo, chưa có cấu hình]. Trân châu, thạch, cốt trà, sốt là bán thành phẩm nấu theo mẻ → cần phiếu chế biến/mẻ có yield (mô hình gần nhất: Lightspeed Batches) [SL]. Hạn ngắn 1–5 ngày (blog Sapo, hai số liệu mâu thuẫn) [TL-blog].
- **Bar**: đồ uống bán theo ml/shot từ chai → cần quy đổi 2 cấp (chai 700 ml → shot 30 ml) [SL]. Loyverse làm được bằng "Sold by Weight" + composite (bia 0,5 L trừ 0,5 L từ item bia) [TL]. Chai là đơn vị đếm, shot là đơn vị bán → kiểm kê theo chai, trừ theo ml [SL].
- **Quán ăn / nhà hàng**: nhiều món, nhiều nguyên liệu tươi, sơ chế (prep item) và waste tươi; 86 khi hết là tính năng chính (Toast, Square) [TL].
- **Tiệm bánh**: sản xuất theo mẻ có yield đơn vị (Lightspeed Batches) và lô/hạn (chỉ Nhanh có cảnh báo hạn theo phiếu nhập) [TL]. Không có hệ nào FEFO theo lô [khoảng trống].
- **Chung cả 4**: made-to-order (trừ khi tạo đơn) và made-in-batches (trừ khi chạy mẻ) là hai thời điểm trừ kho khác nhau (Lightspeed) [TL]. Đây là tham số cấu hình theo món, không theo loại quán.

## Điểm có thể mâu thuẫn với mô hình đề xuất

1. **"Tồn tính từ sổ phiếu kho"**: Toast tính tồn từ lần kiểm kê gần nhất và kiểm kê ghi đè số liệu; Sapo đặt tồn đầu khi tạo nguyên liệu. Sổ phiếu phải có phiếu tồn đầu/kiểm kê như bút toán điều chỉnh, không thể cộng dồn từ 0 [TL].
2. **"Dòng đơn snapshot tên/giá"** là chưa đủ: cần snapshot cả định lượng (phiên bản recipe) lúc bán. Không hệ nào đã đọc mô tả việc đổi định lượng; Odoo chỉ trỏ dòng hoàn trả về dòng gốc [TL code, SL].
3. **"Nhiều lần thanh toán"** kéo theo thời điểm trừ kho: Odoo tạo picking khi paid, hoặc khi đóng phiên nếu bật `update_stock_at_closing`; Lightspeed MTO trừ khi tạo đơn; Sapo trừ khi đơn đạt trạng thái cấu hình. Mô hình cần cờ "thời điểm trừ kho" cấp công ty, không cố định [TL].
4. **Bán thành phẩm**: Toast coi prep item là item có tồn riêng và trừ chính nó; Lightspeed mẻ tạo tồn cho sản phẩm đầu ra. Mô hình hiện "định lượng lồng" chưa nói bán thành phẩm phải là item có tồn và có phiếu sản xuất [TL].
5. **Nguyên liệu là item menu hay danh mục riêng**: Lightspeed và Loyverse bắt nguyên liệu phải là item trong danh mục bán; Sapo và Toast tách kho nguyên liệu. Mô hình phải chọn một [TL].
6. **"Loại quán = dữ liệu mẫu + công tắc tính năng"**: Lightspeed tách sản phẩm theo vertical (K-Series Produce/Batches, O-Series, X-Series retail); tính năng mẻ không chỉ là một công tắc mà là module riêng [SL, từ cấu trúc sản phẩm].
7. **Tồn âm / bán khi hết**: Sapo cho bán âm; Odoo mặc định cho phép tồn âm (bên thứ ba); Square POS vẫn bán món tồn 0 theo báo cáo cộng đồng. Mô hình cần cờ "cho phép tồn âm" và "tự 86 khi về 0" theo công ty/theo món [TL].
8. **Thiếu hao hụt cho phép**: không hệ nào có trường yield%/waste% trong recipe; mô hình cần thêm, hoặc để waste ở phiếu hủy (B5) [TL-khoảng trống].
9. **Món không quản kho**: có cờ "Track stock" theo món (Loyverse, Square) và Odoo chỉ trừ hàng type consu. Mô hình khớp, nên đặt cờ ở mức món [TL].
- Khác biệt giữa các loại quán
- Điểm có thể mâu thuẫn với mô hình đề xuất
