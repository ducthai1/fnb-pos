# Nghiên cứu C: Chuỗi, khuyến mãi, thành viên, phân quyền, chấm công, báo cáo (F&B POS)

Phạm vi: C1–C6. Không gồm order/bàn/bếp/thanh toán, kho/định lượng (agent khác).
Nhãn: [TL] = có trong tài liệu/code (kèm link); [SL] = suy luận. Không tìm thấy = "không tìm thấy".

## Mục lục
- C1. Mô hình đa chi nhánh — XONG
- C2. Khuyến mãi — XONG
- C3. Khách hàng & thành viên — XONG
- C4. Nhân viên & phân quyền — XONG
- C5. Chấm công & lương — XONG (ngắn)
- C6. Báo cáo — XONG

---

## C2. Khuyến mãi

### C2.1 Các loại khuyến mãi
- **So sánh cách làm**:

| Hệ thống | Loại được nêu |
|---|---|
| Sapo FnB (VN) | 4 loại: giảm %, giảm số tiền, đồng giá (món trên ngưỡng về giá X trong thời gian KM), tặng món (đơn tối thiểu hoặc mua A tặng B) [TL] |
| Square for Restaurants | giảm % hoặc số tiền cố định; variable (thu ngân nhập lúc thanh toán); quy tắc theo món/nhóm, số lượng (đúng số / tối thiểu / mua 1 tặng 1), nhóm khách [TL] |
| Toast | discount "fixed" và "open" (open: nhập $ hoặc % lúc áp); comp 100% có sẵn ("Comp check", "Comp item") [TL, search snippet] |
| Lightspeed O-Series | promo "Happy Hour deals" + promo khác; không đọc được nội dung đầy đủ (403) [TL, search snippet] |
| Odoo 18 (code) | `program_type`: coupons, gift_card, loyalty, promotion, ewallet, promo_code, buy_x_get_y, next_order_coupons [TL code] |
| Loyverse | tích điểm + đổi điểm lấy giảm giá; không thấy loại KM khác trong trang đọc được [TL] |
| KiotViet FnB, iPOS, CukCuk, POS365 | không tìm thấy tài liệu (xem Khoảng trống) |

- **Các bước**: [TL] Sapo: vào mục Khuyến mãi tạo chương trình → chọn loại, điều kiện, phạm vi, kênh, thời gian, đối tượng → bật tự động hoặc để chọn tay. Square: Dashboard > Items > Discounts > Create → chọn loại → bật "Discount rules" (item/category, quantity, customer group) → "Set schedule" cho happy hour → Save.
- **Trạng thái**: Sapo: đang chạy / đã ngừng; ngừng có thể "Tiếp tục khuyến mãi" [TL]. Square: bật/tắt qua schedule và date range [TL]. Không tìm thấy trạng thái chi tiết hơn.
- **Luật nghiệp vụ**:
  - Sapo: hóa đơn tối thiểu (trống = mọi đơn); giảm tối đa (trống = không giới hạn); phạm vi toàn đơn / danh mục / món; kênh cửa hàng / web order; thời gian theo khoảng ngày, thứ trong tuần, khung giờ; đối tượng: mọi khách, nhóm khách (giới tính, ngày sinh, tổng chi tiêu), hạng thẻ [TL].
  - Square: discount "tặng miễn phí" = BOGO 100% [TL]; chi tiêu tối thiểu chỉ áp cho discount %; mức giảm tối đa đặt riêng cho từng discount, khi khách dùng nhiều discount thì cap chỉ áp cho discount có giới hạn [TL]; "Apply discount after taxes" để tính thuế trên giá gốc [TL]; món có "Excluded from discounts" thì không bao giờ giảm [TL]; yêu cầu passcode khi áp discount (tùy chọn) [TL].
  - Toast: discount tính trên tổng trước thuế, thuế tính lại trên giá giảm; muốn thuế trên giá gốc phải cấu hình post-tax [TL]. Mặc định discount cấp món KHÔNG kết hợp được, phải bật tùy chọn để cho nhiều discount trên một check [TL]. Món có "Can be discounted?" = No thì discount ra 0 hoặc báo lỗi [TL]. Discount có lịch hiển thị (ngày/giờ) [TL].
  - Odoo code: `minimum_amount`, `minimum_qty` là ngưỡng; `reward_point_mode` = order/money/unit; `applies_on` = current/future/both; `limit_usage` + `max_usage` (ràng buộc >0 khi bật; thực thi nằm ở chỗ khác); `date_from`/`date_to`; `trigger` = `auto` (tự áp theo giỏ) hoặc `with_code` (nhập mã) [TL code, `addons/loyalty/models/loyalty_program.py`, nhánh 18.0].
- **Cộng dồn & thứ tự ưu tiên**:
  - Toast: mặc định không cộng dồn cấp món; bật được [TL].
  - Lightspeed O-Series: "greatest applicable discount wins" khi promo trùng [TL, search snippet].
  - Odoo: field `sequence` chỉ ảnh hưởng thứ tự hiển thị, KHÔNG có logic cộng dồn/loại trừ trong file đọc được [TL code].
  - Sapo, Square (ngoài cap max): không tìm thấy quy tắc cộng dồn tổng quát. [Không tìm thấy]
- **Tự động vs nhân viên chọn**:
  - Square: mặc định manual (thu ngân chọn khi thanh toán); bật "Apply automatically" thì tự áp [TL].
  - Sapo: bật tự động khi tạo đơn, hoặc chọn tay qua biểu tượng khuyến mãi trên màn order [TL].
  - Odoo: `trigger` auto / with_code [TL code].
- **Ca khó / ngoại lệ**:
  - Sapo: không nói giới hạn số lần dùng mỗi khuyến mãi / mỗi khách [Không tìm thấy].
  - Square: discount thủ công kiểu số tiền cố định chỉ áp toàn đơn, không áp từng món; cần giảm món thì dùng automatic dollar hoặc giá riêng [TL].
  - Square: nếu món có "automatically add to check" bật thì không áp discount từng món được (nguồn: community, không chính thức) [community, không tính là TL].
  - Toast: lý do không áp được: discount không active / ngoài lịch / hạn chế quyền / món không cho giảm / mã món không khớp [TL].
  - Khuyến mãi khi hủy/hoàn một phần đơn: [Không tìm thấy] trong 5 nguồn đã đọc. Đây là câu hỏi quan trọng cho thiết kế, cần tìm thêm (nhưng ngoài phạm vi C2 đọc được trong ngân sách).
- **Quyền**:
  - Toast: cần quyền 3.1 Discounts; thiếu quyền thì POS hỏi manager passcode; một số discount luôn cần passcode [TL].
  - Square: có thể yêu cầu passcode khi áp discount [TL].
- **Ảnh hưởng dây chuyền**:
  - Thuế: Toast và Square đều có cờ "giảm trước/sau thuế" [TL]. Đây là quyết định cấu hình cần có trong mô hình.
  - Báo cáo giảm giá: xem C6.
  - Điểm thành viên: Odoo đưa KM và điểm vào cùng một khung rule (`reward_point_*`) [TL code]; nên cân nhắc tách KM và loyalty.
- **Nguồn**:
  - Sapo FnB: https://www.sapo.vn/blog/tao-va-quan-ly-chuong-trinh-khuyen-mai-tren-sapo-fnb
  - Square happy hour (AU help): https://squareup.com/help/au/article/6606-happy-hour-and-discounts-with-square-for-restaurants
  - Toast: https://support.toasttab.com/en/article/Discounting-Items-and-Checks?lang=en_US
  - Lightspeed O-Series promos (snippet): https://o-series-support.lightspeedhq.com/hc/articles/31329470438171 (403 khi fetch)
  - Odoo code: https://raw.githubusercontent.com/odoo/odoo/18.0/addons/loyalty/models/loyalty_program.py

### C2.2 Khuyến mãi theo khung giờ / ngày (happy hour)
- **So sánh cách làm**:

| Hệ thống | Cách làm |
|---|---|
| Sapo FnB | khoảng ngày + thứ trong tuần + khung giờ cố định [TL] |
| Square | "Set schedule" (ngày + giờ) + "Set date range" [TL] |
| Toast | discount có lịch hiển thị ngày/giờ [TL] |
| Lightspeed (cũ, Restaurant Manager) | "Timed events" tự bật/tắt theo ngày giờ; gán vào món/danh mục; không chạy với online ordering bên thứ ba [TL, search snippet, bản cũ] |

- **Các bước**: tạo KM → đặt khung ngày/giờ → gán món/danh mục → hệ thống tự bật/tắt (Square, Lightspeed) [TL].
- **Luật nghiệp vụ**: Lightspeed timed events không chạy với integration online [TL]. Chưa thấy quy định múi giờ, qua nửa đêm [Không tìm thấy].
- **Ca khó**: khung giờ qua nửa đêm (happy hour 22h–1h) — không tìm thấy cách xử lý trong nguồn đọc được [Không tìm thấy]. Đây liên quan trực tiếp đến "ngày kinh doanh" ở C6.
- **Nguồn**: https://squareup.com/help/au/article/6606-happy-hour-and-discounts-with-square-for-restaurants ; Lightspeed timed events (search snippet, chưa mở được).

### C2.3 Mua X tặng Y, combo/đồng giá
- **So sánh cách làm**:
  - Square: BOGO = discount 100% trên món; số lượng: đúng số / tối thiểu / mua 1 tặng 1 [TL].
  - Sapo: tặng món khi đạt đơn tối thiểu hoặc mua A tặng B; "đồng giá" cho món trên ngưỡng giá [TL].
  - Odoo: `buy_x_get_y` là program_type riêng; reward có thể là giảm giá hoặc quà tặng, áp cho sản phẩm hoặc toàn danh mục [TL code + docs].
- **Luật**: Odoo `minimum_qty` là điều kiện số lượng [TL code]. Combo cố định giá (bundle) không tìm thấy là loại riêng trong Square/Toast [Không tìm thấy, Odoo có `loyalty fixed price` chỉ là app bên thứ ba, không tính].
- **Ca khó**: tặng món miễn phí — món tặng có tính giá vốn và kho không? [Không tìm thấy trong nguồn thuộc phạm vi này — chuyển cho agent kho].
- **Nguồn**: như C2.1.

### C2.4 Voucher / mã giảm giá
- **So sánh cách làm**:
  - Odoo: `trigger = with_code`, `promo_code` và `coupons` là program_type riêng [TL code].
  - Lightspeed K-Series: discount code tạo qua Configuration > Settings > Discounts (chỉ thấy trong guide của Marsello, không chính thức) [community/3rd party].
  - Sapo, Square, Toast: không tìm thấy luồng voucher/mã trong nguồn đọc được [Không tìm thấy].
- **Giới hạn số lần dùng**: Odoo `limit_usage`/`max_usage` [TL code]; các hệ khác [Không tìm thấy].
- **Nguồn**: https://raw.githubusercontent.com/odoo/odoo/18.0/addons/loyalty/models/loyalty_program.py

### C2.5 Khuyến mãi theo kênh và theo hạng thành viên
- **Theo kênh**: Sapo có "kênh bán: cửa hàng / Web Order / cả hai" [TL]. Các hệ khác [Không tìm thấy].
- **Theo hạng**: Sapo cho đối tượng theo hạng thẻ (thường, bạc, vàng, kim cương) và nhóm khách theo giới tính, ngày sinh, tổng chi tiêu [TL]. Square: nhóm khách phải tạo trong Customer Directory trước [TL].
- **Nguồn**: https://www.sapo.vn/blog/tao-va-quan-ly-chuong-trinh-khuyen-mai-tren-sapo-fnb ; https://squareup.com/help/au/article/6606-happy-hour-and-discounts-with-square-for-restaurants

### C2.6 Khuyến mãi khi hủy / hoàn một phần đơn
- Không tìm thấy trong 5 hệ đã đọc. Không suy diễn. Cần đợt nghiên cứu riêng (Toast refund/void, Square refund docs).

### Ghi chú chất lượng nguồn C2
- Nguồn chính thức đọc được: Square (AU), Toast, Odoo docs/code, Sapo blog (chính thức của Sapo). Lightspeed O-Series bị 403, chỉ có snippet.
- KiotViet FnB, iPOS, CukCuk: không tìm thấy tài liệu KM. Không điền thay.

## C3. Khách hàng & thành viên

### C3.1 Hồ sơ khách, gắn khách vào đơn
- **So sánh cách làm**:

| Hệ thống | Cách làm |
|---|---|
| Loyverse | khách tạo trên POS hoặc Back Office; cần ít nhất một trong tên/email/SĐT; gắn khách bằng "Add client" trên màn bán, tìm theo tên/email/SĐT, hoặc quét mã vạch [TL] |
| Square Loyalty | khách đăng ký bằng SĐT tại quầy, lúc thanh toán, hoặc mua online; tích điểm bất kể phương thức thanh toán [TL] |
| Sapo FnB | nhóm khách theo giới tính, ngày sinh, tổng chi tiêu, hạng thẻ [TL, trang KM] |
| Odoo | khách có bảng giá mặc định, áp tự động khi chọn khách [TL docs] |

- **Các bước**: 1) tạo/tìm khách (tên/SĐT/email) → 2) gắn vào đơn → 3) điểm hiển thị trên màn POS và in/gửi trên hóa đơn [TL Loyverse].
- **Luật**: chỉ khách đã đăng ký mới có điểm (Loyverse) [TL]. Nhận diện khách bằng SĐT [TL Loyverse, bài customer-identification, không mở].
- **Ca khó**: trùng khách (cùng SĐT, khác tên) — không tìm thấy quy tắc gộp.
- **Quyền**: [Không tìm thấy].
- **Nguồn**: https://help.loyverse.com/help/customers ; https://squareup.com/help/us/en/article/6462 ; https://help.loyverse.com/help/points-discounts

### C3.2 Hạng thẻ và điều kiện lên/xuống hạng
- **So sánh cách làm**:
  - Sapo (blog khuyến mãi, chính thức của Sapo): bạc = 100 điểm giảm 5% mọi đơn; vàng = 1.000 điểm giảm 10% giá trị đơn. Cần bật "Áp dụng chiết khấu hạng thành viên" để áp ưu đãi theo hạng. Sapo dùng hạng để lọc đối tượng KM (thường / bạc / vàng / kim cương) [TL, nhưng là ví dụ blog, không phải cấu hình mặc định].
  - Square: "reward tiers" là các mốc đổi thưởng theo điểm, không phải hạng thành viên cố định; mỗi tầng có phần thưởng riêng; tối đa 15 phần thưởng [TL]. Đây là "tier đổi thưởng", khác "hạng thẻ".
  - Odoo 18: không có field hay logic tier. Chỉ có mốc `points_reach` gửi thông báo email khi thẻ vượt ngưỡng; không đổi hạng [TL code `loyalty_card.py`].
  - Loyverse: không thấy hạng/tier trong trang đọc được [Không tìm thấy].
- **Lên hạng theo gì**: Sapo ví dụ theo điểm tích lũy (không rõ tính theo kỳ hay trọn đời) [Không tìm thấy về kỳ].
- **Xuống hạng**: không tìm thấy trong Sapo/Square/Odoo [Không tìm thấy].
- **Nguồn**: https://www.sapo.vn/blog/tich-diem-khach-hang-tuyet-chieu-khuyen-mai-cac-shop-can-phai-nho/ ; https://squareup.com/help/us/en/article/6462 ; https://raw.githubusercontent.com/odoo/odoo/18.0/addons/loyalty/models/loyalty_card.py

### C3.3 Tích điểm (tỉ lệ, làm tròn, trước/sau giảm giá)
- **So sánh cách làm**:

| Hệ thống | Tỉ lệ tích | Nguồn |
|---|---|---|
| Loyverse | mặc định 1% (100 đơn vị tiền = 1 điểm); chỉnh được, ví dụ 2%, 5% | [TL] |
| Sapo (blog) | 100.000đ = 1 điểm (5 triệu = 50 điểm) | [TL, blog] |
| Square | "Spend" accrual, 1 điểm mỗi X tiền (ví dụ dev docs: 1 điểm/2$ cho món đủ điều kiện); loại trừ món/danh mục chỉ với loại theo chi tiêu [TL] | [TL] |
| Odoo | `reward_point_mode` = order (theo đơn) / money (theo tiền) / unit (theo số lượng); `reward_point_amount`, `reward_point_split`; ngưỡng `minimum_amount`/`minimum_qty` [TL code] | [TL] |

- **Làm tròn**: không tìm thấy quy tắc làm tròn ở Loyverse, Square, Sapo, Odoo (Odoo: không có logic trong file đọc được). [Không tìm thấy]
- **Tính trên tiền trước hay sau giảm giá**: không tìm thấy ở 4 hệ thống. Đây là điểm quyết định phải tự thiết kế và đánh dấu [SL]. Gợi ý [SL]: tách rõ "tiền thực thu" và "tiền gốc" trong snapshot đơn để tính điểm và báo cáo độc lập.
- **Điểm trên đơn có thuế/phí**: không tìm thấy.
- **Quy tắc chung**: Square loại trừ món/danh mục khỏi tích điểm, chỉ ở loại theo chi tiêu [TL].
- **Nguồn**: https://help.loyverse.com/help/how-customer-loyalty-program ; https://www.sapo.vn/blog/tich-diem-khach-hang-tuyet-chieu-khuyen-mai-cac-shop-can-phai-nho/ ; https://squareup.com/help/us/en/article/6462 ; odoo loyalty_program.py

### C3.4 Đổi điểm
- **So sánh cách làm**:
  - Loyverse: nhấn "Add client" → "Redeem points" → hệ thống hiển thị giá trị tối đa → đổi toàn bộ hoặc nhập thấp hơn → "OK"; mức giảm xuất hiện trong mục Discounts của đơn; "Charge" để hoàn tất. Tỉ lệ ví dụ: 10 điểm = 10 đơn vị tiền [TL].
  - Sapo (máy bán hàng): nhập số điểm vào ô "Đổi điểm", hệ thống quy đổi và trừ vào tổng đơn; 1 điểm = 1.000đ (ví dụ 73 điểm = 73.000đ) [TL].
  - Sapo (blog): 100 điểm đổi quà (áo), 200 điểm đổi quần; nhận quà thì điểm về 0. Số tiền giảm có trần theo % đơn (không nêu số) [TL blog].
  - Square: đổi qua reward (giảm toàn đơn, giảm món/danh mục, món miễn phí, combo); mỗi reward phải chọn món ở từng địa điểm để đổi được ở mọi chi nhánh [TL].
  - Odoo: nút "Rewards" khi đủ điểm; thao tác thủ công [TL code/docs].
- **Ngưỡng/giới hạn đổi**: Loyverse không có ngưỡng tối thiểu hay giới hạn trong trang [Không tìm thấy]. Sapo: không có giới hạn tối đa trong bài [Không tìm thấy]. Square: ngưỡng gắn theo tầng reward [TL].
- **Đổi điểm có nằm trong KM không**: Loyverse đặt vào mục Discounts của đơn [TL]. Cách KM và điểm cùng cộng dồn: không tìm thấy.
- **Nguồn**: https://help.loyverse.com/help/points-discounts ; https://www.sapo.vn/cap-nhat-tinh-nang/tinh-nang-loyalty-tren-may-ban-hang ; https://www.sapo.vn/blog/tich-diem-khach-hang-tuyet-chieu-khuyen-mai-cac-shop-can-phai-nho/ ; https://squareup.com/help/us/en/article/6462

### C3.5 Điểm hết hạn
- **Square**: đặt số tháng hết hạn, hoặc "Never"; cấu hình ở Settings > Earning Points > Expiry; khách nhận SMS trước 14 ngày; nhân viên xem điểm sắp hết hạn trong hồ sơ khách [TL].
- **Odoo 18**: field `expiration_date` chỉ được lưu; code đọc được không tự vô hiệu hóa khi quá hạn; loyalty không cho đặt ngày hết hạn (onchange báo lỗi) [TL code]. Vậy Odoo không có hết hạn điểm loyalty ở cấp đọc được.
- **Loyverse, Sapo**: không tìm thấy quy định hết hạn [Không tìm thấy].
- **Ca khó [SL]**: điểm hết hạn khi khách đang có đơn mở, hoặc khi hoàn điểm đã tiêu — chưa có nguồn.

### C3.6 Hoàn điểm khi hủy / hoàn đơn
- Square: không tìm thấy [Không tìm thấy].
- Odoo: không có method hoàn điểm trong `loyalty_card.py`; các hook `_has_source_order()` và `_compute_use_count()` để module khác ghi đè, nên luật (nếu có) nằm ở module khác [TL code, không kết luận được].
- Loyverse, Sapo: không tìm thấy [Không tìm thấy].
- Kết luận: không có hệ thống nào trong nguồn đọc được nêu rõ luật hoàn điểm khi hủy. Đây là khoảng trống lớn, cần thiết kế riêng [SL].

### C3.7 Thẻ trả trước / nạp tiền (stored value)
- Odoo 18: `program_type` có `gift_card` và `ewallet`; số dư lưu trong field `points`; hiển thị dạng tiền khi đơn vị điểm trùng ký hiệu tiền tệ; điều chỉnh số dư qua wizard `loyalty.card.update.balance`; logic trừ khi thanh toán không có trong file đọc được [TL code].
- Sapo, KiotViet, POS365: tìm kiếm không ra tài liệu thẻ trả trước [Không tìm thấy].
- Gift card Odoo: mã thẻ unique (`card_code_unique`), tự sinh [TL code].
- Nguồn: https://raw.githubusercontent.com/odoo/odoo/18.0/addons/loyalty/models/loyalty_card.py

### Điểm mâu thuẫn trong nguồn C3
- Sapo blog: "mỗi lần mua được 10 điểm" và "100.000đ = 1 điểm" cùng xuất hiện; blog này là nội dung khuyến mãi tổng quát, không phải tài liệu cấu hình. Không dùng làm mặc định.

## C4. Nhân viên & phân quyền

### C4.1 Vai trò mặc định và mô hình quyền
- **So sánh cách làm**:

| Hệ thống | Mô hình | Vai trò / bộ quyền |
|---|---|---|
| Toast | quyền theo **job** (khuyến nghị) + ghi đè theo từng người [TL] | job tự đặt; không thấy vai trò mặc định trong trang đọc được |
| Loyverse | 4 vai trò: Owner (toàn quyền, không sửa được), Administrator, Manager, Cashier; các vai trò còn lại sửa được [TL] | nội dung quyền từng vai trò không có trong trang [Không tìm thấy] |
| Square | "Permission sets" gắn vào team member; mức Standard / Enhanced / Full, hoặc Customize từng quyền; Full = mọi quyền trừ quản lý tài khoản ngân hàng [TL] | ví dụ bảng trong bài 6430: server có quyền discount/void, runner không; cashier áp được discount/comp hạn chế nhưng không xoá/void món đã lưu trong open ticket (theo bài help, xem xét lại) [TL, bảng mẫu] |
| Sapo FnB | phân quyền xem / sửa / xóa theo vị trí; vai trò mẫu: nhân viên bán hàng, thu ngân, quản lý ca, quản lý tổng [TL blog] | chi tiết danh sách quyền: không mở được (help.sapo.vn) |
| Odoo | nhóm quyền ở backend; không mở được tài liệu native về discount limit [Không tìm thấy] | — |

- **Luật**:
  - Toast: khuyến nghị gán quyền theo job, chỉ dùng quyền cá nhân để ngoại lệ [TL].
  - Square: nhân viên chỉ thao tác dữ liệu ở location được gán [TL].
- **Ca khó**: Square community báo cáo nhân viên vẫn comp được check bằng cách sửa item, bỏ qua prompt manager ở nút comp (community, chưa xác nhận đã fix) [community].
- **Nguồn**: https://doc.toasttab.com/doc/platformguide/adminPermissions.html ; https://squareup.com/help/us/en/article/6430-setting-up-your-employees-with-square-for-restaurants ; https://help.loyverse.com/help/how-manage-access-rights-employees ; https://www.sapo.vn/cap-nhat-tinh-nang/phan-quyen-nhan-vien

### C4.2 Danh sách quyền chi tiết (hủy món, giảm giá, mở két, báo cáo, sửa giá)

| Nhóm nghiệp vụ | Toast [TL] | Loyverse [TL] | Square [TL/community] |
|---|---|---|---|
| Hủy món / order đã gửi bếp | "Void Items / Orders" (Manager); đi kèm Table Service hoặc Quick Order Mode | "Void món đã lưu trong ticket mở" (POS) | cancel/void trong Team > Checkout (community: quyền "Cancel Transactions") |
| Hủy đơn đã đóng / hoàn tiền | "Void / Refund Payments" (Manager); bản "Same Day Only" không cần manager | "Thực hiện hoàn trả (refund)"; Back Office: "Hủy hóa đơn" | không tìm thấy trong bài đọc được |
| Giảm giá | "Discounts" (Manager); discount tự tạo qua Setup | "Áp dụng giảm giá có giới hạn" (restricted discounts) | "Apply Restricted Discounts and Comps" trong Permissions |
| Comp (miễn phí) | không có quyền riêng trong tài liệu | gộp trong giảm giá | cùng quyền Restricted Discounts and Comps |
| No Sale mở két | "No Sale" (POS), không cần manager, đi kèm Quick Order | "Mở két không cần giao dịch" | không tìm thấy |
| Sửa giá / menu | "Edit Full Menu" (Restaurant Admin); "Quick Edit" trên POS gồm Price | "Quản lý sản phẩm" — không rõ có bao gồm giá | không tìm thấy |
| Sửa món đã gửi bếp | "Edit Sent Items" (Manager), bếp thấy _CHANGED_; không có quyền riêng đổi giá/số lượng món đã gửi | "Sửa" không mô tả | không tìm thấy |
| Xem báo cáo | Sales Reports, Menu Reports, Labor Reports, Shift Review Sales Data, Close Out Day (Manager) | Back Office: xem báo cáo bán hàng; POS: xem báo cáo ca | "Team"/Permissions (không chi tiết) |
| Két: pay-out, điều chỉnh tiền đầu ca | "Pay Out", "Adjust Cash Drawer Start Balance", "Cash Drawer Lockdown (Override)" (Manager) | "Mở két" là quyền riêng | không tìm thấy |
| Xem giá vốn | không tìm thấy | "Xem giá vốn (cost)" trên POS | không tìm thấy |
| Xem mọi hóa đơn | không tìm thấy | Xem tất cả hóa đơn; tắt thì chỉ 5 hóa đơn gần nhất | không tìm thấy |

- **Luật**: Toast void/refund cùng ngày có thể không cần manager (tùy quyền) [TL]. Loyverse chỉ giới hạn xem hóa đơn còn 5 gần nhất khi tắt [TL].
- **Nguồn**: https://doc.toasttab.com/doc/platformguide/adminPermissions.html ; https://help.loyverse.com/help/how-manage-access-rights-employees ; community Square (search snippet, không phải tài liệu chính thức).

### C4.3 Đăng nhập nhanh bằng PIN trên máy bán hàng
- **Loyverse** [TL]: PIN 4 số, duy nhất cho từng người; yêu cầu PIN khi đăng nhập POS, khi đổi người dùng, và khi thiết bị thức dậy từ sleep; chỉ owner hoặc người có quyền Employee Management xem/sửa PIN.
- **Toast** [TL]: passcode nhân viên quản lý trên Toast Web (quyền "Employee Info"); quẹt thẻ từ (Register Swipe Cards) thay cho passcode.
- **Square** [TL]: "Team passcode" là mã **dùng chung** cho nhiều nhân viên trên một POS; mã này KHÔNG ghi doanh số, thời gian hay hoạt động theo từng người. Đây là điểm yếu cho audit (xem C4.5).
- **Sapo, iPOS, CukCuk**: không tìm thấy tài liệu về đăng nhập PIN. (Kết quả SHOPLINE không áp dụng được cho Sapo.)
- **Nguồn**: https://help.loyverse.com/help/pin-code-access (search snippet) ; https://doc.toasttab.com/doc/platformguide/adminPermissions.html ; https://squareup.com/help/us/en/article/6430-setting-up-your-employees-with-square-for-restaurants (dạng ngắn, đã mở qua redirect).

### C4.4 Quản lý duyệt tại chỗ (nhập PIN quản lý)
- **Loyverse** [TL]: khi nhân viên thiếu quyền, POS yêu cầu PIN của người có quyền để cấp quyền **một lần** (one-time grant). Đây là mẫu tốt nhất trong các nguồn đọc được.
- **Toast** [TL]: nhân viên thiếu quyền 3.1 Discounts → POS hỏi manager passcode; một số discount luôn cần passcode dù nhân viên có quyền. Split Checks cũng cần manager passcode.
- **Square** [TL + community]: có tùy chọn yêu cầu passcode khi áp discount; cách manager duyệt không để nhân viên thấy mã là yêu cầu cũ, chưa rõ đã có chưa [community].
- **Odoo** [third-party, chưa xác minh]: các module App Store mô tả popup duyệt khi discount vượt ngưỡng %, nhập PIN của người được ủy quyền; có giới hạn % theo nhân viên. Không phải tài liệu native.
- **Sapo, iPOS**: không tìm thấy luồng PIN duyệt. Sapo blog khuyến nghị quản lý duyệt hủy món/giảm giá nhưng không nói cơ chế [TL blog, khuyến nghị chung].
- **Nguồn**: https://help.loyverse.com/help/how-manage-access-rights-employees ; https://support.toasttab.com/en/article/Discounting-Items-and-Checks?lang=en_US ; https://apps.odoo.com/apps/modules/18.0/eg_pos_discount_restriction (third-party).

### C4.5 Nhật ký thao tác (audit log)
- **Sapo** [TL blog]: "mọi thao tác của nhân viên được lưu trên phần mềm" để đối soát; không có chi tiết cách xem hoặc thời hạn lưu.
- **iPOS** [TL, snippet trang sản phẩm, chưa mở]: phân quyền riêng cho sửa hóa đơn và giảm giá; "ghi nhận toàn bộ lịch sử thao tác".
- **Square** [TL]: team passcode không ghi theo từng người → audit theo người không đủ nếu dùng mã chung.
- **Toast** [TL]: có quyền "Edit Historical Data" và "Edit Time Entries" cần shift review; không thấy tên audit log riêng trong trang đọc được.
- **Loyverse, Odoo native**: không tìm thấy.
- **Nguồn**: https://www.sapo.vn/blog/quan-ly-nhan-vien-hieu-qua-voi-tinh-nang-phan-quyen-nhan-vien-tren-sapo ; https://ipos.vn/en/san-pham/ipos-callcenter-giai-phap-quan-tri-don-hang-online/ (snippet) ; https://squareup.com/help/us/en/article/6430-setting-up-your-employees-with-square-for-restaurants

### C4.6 Ảnh hưởng dây chuyền
- Quyền giảm giá/void ảnh hưởng báo cáo (C6) và đối soát két ca [TL: Toast Shift Review, Loyverse báo cáo ca có tiền mặt dự kiến].
- Quyền "xem giá vốn" (Loyverse) ảnh hưởng lợi nhuận: giá vốn không nên lộ cho thu ngân [SL].

### Khoảng trống C4
- Không có bài nào liệt kê đủ quyền của Sapo FnB, KiotViet FnB, iPOS, CukCuk, POS365 trong ngân sách đã dùng.
- Không có cơ chế "mã PIN duyệt không để lộ với nhân viên" đã xác minh.

## C5. Chấm công & lương (ghi ngắn)

- **Toast** [TL]: có clock-in/ca và thẻ chấm công trong Shift Review; "Edit Time Entries" (Manager) sửa giờ vào/ra, phải đi kèm Shift Review; "My Reports" xem chấm công của chính mình; "Labor Reports" báo cáo lao động; "Negative Declared Tips" (nhập tip âm khi shift review). Lương/hoa hồng: không thấy trong trang đọc được.
- **Loyverse** [TL]: báo cáo ca có tiền mặt dự kiến; không thấy chấm công/lương trong trang quyền.
- **Sapo FnB** [TL blog]: có bài "giải pháp chấm công nhà hàng" (mở đầu, không có bước cụ thể); hoa hồng dựa trên báo cáo doanh số theo nhân viên để thống kê, không phải tính năng tính sẵn [TL blog, chưa xác nhận là tính năng].
- **Square, Odoo native**: không tìm thấy trong nguồn đọc được (Square chỉ có Labor Reports đã thấy qua Toast; không đủ dữ liệu).
- **KiotViet, iPOS, CukCuk, POS365**: không tìm thấy tài liệu chấm công/lương (kết quả KiotViet là tin tuyển dụng, bỏ).
- **Kết luận [SL]**: chấm công/lương thường là module tách; trong mô hình đề xuất chỉ cần khóa giờ ca và liên kết nhân viên để báo cáo theo ca. Không đủ bằng chứng để thiết kế lương/hoa hồng.
- **Nguồn**: https://doc.toasttab.com/doc/platformguide/adminPermissions.html ; https://www.sapo.vn/blog/giai-phap-cham-cong-nha-hang

## C1. Mô hình đa chi nhánh

### C1.1 Cấp tổ chức: công ty / thương hiệu / chi nhánh
- **Toast** [TL]: cấu trúc "restaurant group" (cấp cao nhất) → location. Cấu hình tập đoàn đặt ở cấp group rồi áp xuống location (void reason, discount rules, thuế suất item có thể đặt cấp corporate và áp cho location mới — trang marketing, cần xác nhận) [TL marketing].
- **iPOS.vn** [TL, snippet trang sản phẩm]: một tài khoản quản lý nhiều thương hiệu/chuỗi; phí giao hàng và phí dịch vụ cài riêng theo thương hiệu hoặc chi nhánh; phân quyền chủ thương hiệu / quản lý ca / thu ngân / phục vụ.
- **Square** [TL]: cấp "location" là đơn vị chính; nhân viên chỉ thao tác dữ liệu ở location được gán. Không thấy cấp thương hiệu/công ty trong nguồn đọc được [Không tìm thấy].
- **Loyverse** [TL]: Back Office quản lý nhiều cửa hàng; điểm tích và đổi được ở mọi cửa hàng trong chuỗi.
- **Sapo, KiotViet, CukCuk, POS365**: không tìm thấy mô hình cấp tổ chức trong nguồn đọc được.
- **Mô hình nhượng quyền (franchise)**: không tìm thấy tài liệu nào trong nguồn đã đọc. Không suy diễn.

### C1.2 Menu trung tâm vs chi nhánh ghi đè
| Hệ thống | Menu gốc | Ghi đè giá | Bật/tắt món theo chi nhánh |
|---|---|---|---|
| Toast | giá ở cấp group; mỗi món bật "Location Specific Price" trong Menus > Bulk management > Advanced properties, rồi nhập giá theo location ở Price editor hoặc trang món; publish qua Publish config [TL] | location không có giá riêng → dùng giá của group (fallback) [TL] | menu versions khác nhau theo location: "một món xuất hiện ở địa điểm này mà không ở địa điểm khác" [TL marketing] |
| Square | giá gốc trên item/variation trong Item library [TL] | "Add price override" theo nhiều location cùng lúc; hiện nhãn "Varies by location"; **không tạo được trên POS app**, chỉ trên Dashboard [TL] | không tìm thấy |
| Loyverse | Back Office | không tìm thấy trong trang đọc được | không tìm thấy |
| iPOS | menu tự đổi theo thương hiệu khi nhận cuộc gọi (snippet) [TL snippet] | — | — |

- **Ca khó (Square)**: user báo cáo override làm giá base ở tất cả location thành 0 (community, chưa có lời giải); bài help không nói location không chọn thì dùng giá nào [TL/không tìm thấy].
- **Quyền**: Toast có "Local Menu Edit" (chỉ sửa menu của đơn vị mình) và "Edit Full Menu" (Restaurant Admin) [TL]. Square: chủ tài khoản và người có quyền tạo item [TL].
- **Publish**: Toast yêu cầu publish sau khi sửa giá/menu, có "Change sets" để lên lịch [TL]. Nghĩa là có trạng thái "nháp" và "đã publish" cho cấu hình — ảnh hưởng thiết kế (xem Điểm mâu thuẫn).

### C1.3 Cấu hình nào ở cấp nào (tổng hợp từ nguồn)
| Cấu hình | Cấp group/tổ chức | Cấp chi nhánh | Nguồn |
|---|---|---|---|
| Giá gốc món | có (fallback) | ghi đè | Toast, Square [TL] |
| Discount rules / void reasons | có (Toast marketing) | kế thừa | Toast marketing [TL marketing] |
| Phí giao hàng / phí dịch vụ | theo thương hiệu | theo chi nhánh | iPOS snippet [TL snippet] |
| Điểm thành viên dùng ở mọi chi nhánh | có | — | Loyverse, Square [TL] |
| Quyền nhân viên | theo location được gán | — | Square [TL] |
| Giờ cutoff ngày kinh doanh | không tìm thấy (Toast cố định 4am, không đổi được ở quốc tế) | — | Toast [TL] |

### C1.4 Báo cáo hợp nhất
- **Toast** [TL marketing]: báo cáo xem theo location hoặc cấp group; so sánh hiệu suất món giữa location.
- **Square, Loyverse, iPOS, Sapo**: không đủ dữ liệu trong nguồn đọc được.

### C1.5 Liên chi nhánh (ngoài phạm vi chính, ghi nhận)
- Loyverse: điểm tích/đổi ở mọi chi nhánh [TL].
- Square Loyalty: reward món/combo phải chọn món ở từng địa điểm để đổi được ở mọi chi nhánh [TL].

### Khoảng trống C1
- Mô hình nhượng quyền (royalty, menu bắt buộc, báo cáo gửi về tổng): không tìm thấy.
- Chi nhánh tắt món có hiệu lực tức thì hay sau publish: chỉ thấy Toast có publish, chưa đủ chi tiết.
- Chuyển món/kho giữa chi nhánh: thuộc agent kho.

---

## C6. Báo cáo

### C6.1 Báo cáo chuẩn có trong nguồn
- **Toast Z report / Close Out Day** [TL]: bật/tắt từng phần: doanh thu theo danh mục, theo revenue center; tổng bán hàng và thuế; tổng thanh toán; tip; **void, removal, discount**; chi tiết thẻ; labor; over/short nhân viên; chi tiết pay-out; deposit summary. Báo cáo in được từ Close Out Day mà không kết thúc ngày, cập nhật theo thời gian thực.
- **Toast báo cáo theo quyền** [TL]: Sales Reports, Menu Reports, Labor Reports, Gift/Rewards Card Reports, Shift Review Sales Data, Close Out Day.
- **Loyverse** [TL]: báo cáo ca (có tiền mặt dự kiến); báo cáo bán hàng ở Back Office.
- **Square, Sapo, iPOS, KiotViet, CukCuk**: không tìm thấy danh sách báo cáo chi tiết trong nguồn đọc được. Cần đợt nghiên cứu riêng để có "báo cáo theo giờ/ngày/món/nhân viên/kênh" và báo cáo hủy món / giảm giá từ nhiều nguồn hơn.
- **Báo cáo hủy món, giảm giá**: Toast có dòng void / removal / discount trong Z report [TL]. Không tìm thấy báo cáo hủy món riêng ở nguồn khác.
- **Doanh thu theo giờ, theo kênh, theo nhân viên**: Toast có "Shift Review Sales Data" và Sales Reports, nhưng chi tiết theo giờ/kênh không đọc được [Không tìm thấy].

### C6.2 Định nghĩa doanh thu
- **Toast, US/Canada** [TL]: gross sales = chưa gồm thuế; **net sales = tổng − thuế − discount − refund**.
- **Toast, UK/Ireland** [TL]: mọi số liệu tính theo giá đã gồm thuế.
- **Việt Nam (VAT)**: không tìm thấy trong nguồn đọc được. [Không tìm thấy]. Đây là chỗ phải tự quyết theo quy định thuế VN [SL].
- **Tip**: Toast chỉ hiện tip server khi tip không tiền mặt và gratuity đều đặt "pay out from cash drawer" [TL].

### C6.3 Ngày kinh doanh (business day) khi quán mở qua nửa đêm
- **Toast** [TL]: cutoff mặc định **4:00 sáng** giờ địa phương (quốc tế cố định, US theo ET). Tự động: đóng check đã thanh toán còn mở, clock-out nhân viên còn ca, auto-capture thẻ của ngày trước.
- Check **chưa thanh toán không tự đóng** — phải xử lý thủ công; nút End day bị khóa cho đến khi xong [TL].
- Auto-capture chạy lúc 4:00; paid check chưa đóng sẽ được đóng không tip rồi capture → chỉnh tip trước 4:00 [TL].
- Mất mạng sau cutoff: Toast tự capture khi có lại kết nối, không capture tay [TL].
- Shift review cần ~30 phút, nên bắt đầu trước cutoff 30 phút [TL].
- Community: report chốt ngày khoảng 4:18–5:00 nên báo cáo lúc 3h vẫn là ngày trước [community, không chính thức].
- Hệ quả [SL]: happy hour 22h–1h thuộc business date của ngày hôm trước nếu cutoff 4am; mô hình nên lưu `business_date` trên đơn thay vì suy từ `created_at`.
- Các hệ khác: không tìm thấy quy tắc business date.

### C6.4 Quy trình cuối ngày (Close Out Day)
1. Manager Activities > Close Out Day [TL].
2. Đóng check chưa thanh toán (bắt buộc, End day khóa đến khi xong).
3. Check đã thanh toán: "Close all (no tips)" hoặc "Adjust tips".
4. Đơn chờ lấy: đánh dấu đã lấy hoặc xem.
5. Clock out nhân viên đang ca.
6. Hệ thống auto-resolve phần còn lại; không xử lý được check chưa thanh toán [TL].
- Quyền: "Cash Drawer Access" phải bật và publish mới chạy được (Toast, nguyên nhân phổ biến nhất khi lỗi) [TL].

### C6.5 Ảnh hưởng dây chuyền
- Void/discount trong Z report → phải tách rõ trong dữ liệu đơn để báo cáo hủy và giảm giá truy vấn được [SL].
- Net sales trừ refund ⇒ refund phải là bút toán riêng, không sửa đơn gốc [SL dựa trên công thức Toast].

### Khoảng trống C6
- Báo cáo theo giờ, theo kênh, theo nhân viên ở Square/Sapo/KiotViet/iPOS/CukCuk: chưa đọc được.
- Định nghĩa VAT trước/sau giảm: không tìm thấy trong VN.

---

## Khoảng trống — flow/luật không tìm được tài liệu
- Khuyến mãi khi hủy/hoàn một phần đơn (C2.6): không có nguồn nào trả lời. Ưu tiên cao.
- Quy tắc cộng dồn tổng quát giữa KM và điểm/voucher: không có nguồn đủ rõ (chỉ Toast: mặc định không cộng dồn cấp món; Lightspeed O-Series: "greatest discount wins").
- Giới hạn số lần dùng KM/voucher ở Sapo/Square/Toast: không tìm thấy.
- Làm tròn điểm; điểm tính trước hay sau giảm; điểm có trên thuế không: không tìm thấy ở 4 hệ đã đọc.
- Hoàn điểm khi hủy/refund: không tìm thấy (Odoo chỉ có hook, không có logic).
- Hạng thành viên: lên/xuống theo kỳ hay trọn đời; xuống hạng: không tìm thấy.
- Thẻ trả trước VN (tạo thẻ, nạp, trừ dần, hoàn): không tìm thấy trong Sapo/KiotViet/POS365.
- Chấm công, lương, hoa hồng: không đủ tài liệu ở VN.
- Đăng nhập PIN, danh sách quyền đầy đủ, manager PIN duyệt ở Sapo FnB, KiotViet FnB, iPOS, CukCuk, POS365: không mở được tài liệu.
- Mô hình nhượng quyền: không tìm thấy.
- Báo cáo theo giờ/kênh/nhân viên, báo cáo hủy món riêng ở Square/Sapo/iPOS/KiotViet/CukCuk: không tìm thấy.
- Lightspeed O-Series và Odoo native gốc (`pos_loyalty`, `point_of_sale`): O-Series trả 403; Odoo chỉ đọc được `loyalty` module và docs 18.0.
- KiotViet help center (help.kiotviet.vn): tìm kiếm không ra trang nào; hầu hết kết quả là tin tuyển dụng hoặc bài bên thứ ba.

## Khác biệt giữa các loại quán — chỗ cafe/trà sữa/quán ăn/bar/bakery làm KHÁC nhau thật sự
Dữ liệu yếu. Chỉ có tín hiệu gián tiếp, không đủ để kết luận theo loại quán:
- Happy hour theo khung giờ là KM đặc trưng: Square, Lightspeed (timed events), Toast đều có cơ chế lịch. Phù hợp bar/cafe [TL công cụ, SL nhu cầu].
- Cấu hình cutoff ngày kinh doanh: Toast cố định 4am. Quán bar/nhà hàng mở khuya cần cờ business date; quán cafe sáng sớm thì ít bị ảnh hưởng [SL].
- Tích điểm: Loyverse, Square và Sapo đều hướng đến thẻ/điểm cho mọi loại. Không tìm thấy tài liệu chỉ cho trà sữa, dù có bài blog Sapo "thẻ tích điểm trà sữa" (chưa mở được).
- Quán ăn/nhà hàng: Toast có "Table Service Mode" và "Quick Order Mode" tách quyền; quyền void/discount gắn với mode này [TL]. Quán nhanh (quick order) và quán bàn khác nhau về quyền [TL].
- Bakery: không tìm thấy tài liệu riêng.
- Kết luận [SL]: ngoài KM theo giờ và cutoff, không có bằng chứng đủ mạnh để tách cấu hình theo loại quán ở phần C. Nên giữ cấu hình chung + công tắc, đúng như mô hình đề xuất.

## Điểm có thể mâu thuẫn với mô hình đề xuất
Mô hình dự kiến: Món → Biến thể → Nhóm tùy chọn → Tùy chọn; đơn có kiểu phục vụ; dòng đơn lưu snapshot; nhiều lần thanh toán; tồn kho từ sổ phiếu; loại quán = dữ liệu mẫu + công tắc.
- **Giá theo chi nhánh cần cấp biến thể**: Square override theo variation [TL]; Toast location price theo món (modifier/variation chưa xác nhận). Mô hình cần bảng giá theo (biến thể × chi nhánh) với fallback về giá group — chưa có trong mô hình.
- **Khuyến mãi là lớp riêng, không phải thuộc tính món**: Odoo gộp coupon, promo, loyalty, gift card, ewallet thành một `loyalty.program` với rules [TL code]; Toast/Square tách discount khỏi món. Mô hình thiếu một bảng khuyến mãi/quy tắc giảm giá (scope, điều kiện, lịch, giới hạn, ưu tiên). Odoo là ngoại lệ — đề nghị tách KM và loyalty dù code Odoo gộp.
- **Snapshot dòng đơn phải lưu cả giá gốc, giảm, thuế**: Toast tính thuế lại sau giảm; Square có cờ "giảm sau thuế" [TL]. Dòng đơn cần lưu `gross`, `discount`, `tax`, `net` riêng, không chỉ một `price`.
- **Điểm và ví trả trước không nên dùng chung một cột**: Odoo lưu số dư gift card/ewallet trong cùng field `points` [TL code]. Đề xuất: sổ cái điểm và sổ cái tiền tách riêng, có bút toán.
- **Ngày kinh doanh**: mô hình chưa có khái niệm này. Toast cutoff 4am và auto-close tự động [TL] → cần `business_date` trên đơn và ca, không suy từ thời gian tạo.
- **Đơn đã đóng cần hoàn/void tách bút toán**: Toast net sales = trừ refund, void hiển thị như dòng riêng [TL]. Mô hình "snapshot" phải cho phép bút toán đảo, không sửa đơn gốc.
- **Cấu hình kế thừa 2 cấp (group → location)**: Toast cho thấy mô hình kế thừa (fallback) [TL]. Mô hình "công tắc theo loại quán" cần thêm tầng kế thừa tổ chức → chi nhánh, không chỉ loại quán.
- **Quyền PIN ghi đè**: Loyverse dùng PIN người có quyền để cấp quyền một lần [TL]; mô hình chưa có khái niệm "duyệt thay" và nhật ký ai duyệt. Cần bảng approval log.
- **Nhân viên dùng chung mã (Square)**: không ghi được người thao tác → mô hình phải ghi `user_id` theo thao tác, không dùng PIN/mã dùng chung làm định danh.

## Mục nguồn chính (đã mở được)
- Sapo FnB KM: https://www.sapo.vn/blog/tao-va-quan-ly-chuong-trinh-khuyen-mai-tren-sapo-fnb
- Sapo loyalty máy bán hàng: https://www.sapo.vn/cap-nhat-tinh-nang/tinh-nang-loyalty-tren-may-ban-hang
- Sapo phân quyền: https://www.sapo.vn/cap-nhat-tinh-nang/phan-quyen-nhan-vien
- Sapo blog tích điểm (không phải tài liệu cấu hình): https://www.sapo.vn/blog/tich-diem-khach-hang-tuyet-chieu-khuyen-mai-cac-shop-can-phai-nho/
- Square happy hour (AU): https://squareup.com/help/au/article/6606-happy-hour-and-discounts-with-square-for-restaurants
- Square loyalty FAQ: https://squareup.com/help/us/en/article/6462
- Square team permissions: https://squareup.com/help/us/en/article/6430-setting-up-your-employees-with-square-for-restaurants
- Square price override: https://squareup.com/help/article/8242
- Toast discounts: https://support.toasttab.com/en/article/Discounting-Items-and-Checks?lang=en_US
- Toast permissions: https://doc.toasttab.com/doc/platformguide/adminPermissions.html
- Toast Z report / Close Out Day: https://support.toasttab.com/en/article/Close-Out-Day-Z-Report-Auto-Capture?lang=en_US
- Toast location price: https://doc.toasttab.com/doc/platformguide/adminEnablingAndSettingLocationSpecificPrices.html
- Loyverse loyalty: https://help.loyverse.com/help/how-customer-loyalty-program ; redeem: https://help.loyverse.com/help/points-discounts ; quyền: https://help.loyverse.com/help/how-manage-access-rights-employees
- Odoo loyalty code: https://raw.githubusercontent.com/odoo/odoo/18.0/addons/loyalty/models/loyalty_program.py ; loyalty_card: https://raw.githubusercontent.com/odoo/odoo/18.0/addons/loyalty/models/loyalty_card.py ; docs: https://www.odoo.com/documentation/18.0/applications/sales/point_of_sale/pricing/loyalty.html
- Snippet (chưa mở): Lightspeed O-Series https://o-series-support.lightspeedhq.com/hc/articles/31329470438171 ; iPOS https://ipos.vn/en/san-pham/ipos-callcenter-giai-phap-quan-tri-don-hang-online/ ; Sapo chấm công https://www.sapo.vn/blog/giai-phap-cham-cong-nha-hang

## Hạn chế nghiên cứu
- Ngân sách ~22 WebSearch, ~20 WebFetch. Không đủ để mở sâu KiotViet FnB, iPOS, CukCuk, POS365 — vốn có tài liệu VN ít công khai.
- Nhiều nguồn Square/Toast/Sapo là bản AU/US/blog; luật có thể khác bản VN.
- Nguồn community và marketing được đánh dấu riêng, không dùng làm căn cứ chính.
- Không kiểm chứng được luật bằng hệ thống chạy thật (không có tài khoản demo).

## Câu hỏi chưa giải quyết
1. Hoàn/hủy đơn có khuyến mãi và điểm: quy tắc nào? (ưu tiên cao cho thiết kế)
2. Điểm tính trước hay sau giảm, làm tròn thế nào, có trên VAT không?
3. Thứ tự ưu tiên và cộng dồn khi nhiều KM cùng thỏa ở Sapo/KiotViet/iPOS?
4. Cách mở tài liệu help.sapo.vn / help.kiotviet.vn (phân quyền chi tiết, PIN, KM VN)?
5. Mô hình nhượng quyền có cần trong v1 hay không (YAGNI)?
