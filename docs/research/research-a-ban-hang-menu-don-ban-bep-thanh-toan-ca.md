# Nghiên cứu A — Bán hàng tại quán: menu, đơn, bàn, bếp, thanh toán, ca, hủy/hoàn, in ấn

Phạm vi: bán hàng tại quán. Ngoài phạm vi: kho/định lượng/giá vốn, khuyến mãi/thành viên/phân quyền chi tiết/báo cáo.
Nhãn: [TL] = tài liệu/code có link; [SL] = suy luận. Không tìm thấy = "không tìm thấy".

## Mục lục (đang làm)

- A1. Cấu trúc menu — đã viết (phần VN không tìm thấy)
- A2. Tạo đơn & vòng đời đơn theo kênh — đã viết (phần quầy trả trước VN không tìm thấy)
- A3. Bàn — đã viết
- A4. Bếp/bar — đã viết (KDS trạng thái món không tìm thấy)
- A5. Thanh toán — đã viết (đa phương thức, VAT, làm tròn không tìm thấy)
- A6. Hủy/hoàn — đã viết (hoàn một phần không tìm thấy)
- A7. Ca & két — đã viết
- A8. In ấn — đã viết (bill tạm tính không tìm thấy)

Ghi chú nguồn: KiotViet FnB, Sapo FnB, iPOS, CukCuk, POS365 gần như không có tài liệu công khai đọc được qua tìm kiếm (help center 404/không index). Phần VN đa số "không tìm thấy", chỉ dùng được tín hiệu gián tiếp. Xem mục Khoảng trống.

---

### A1. Cấu trúc menu

- **So sánh cách làm**

| Hệ thống | Cách làm đã đọc được |
|---|---|
| Square for Restaurants | Modifier set riêng (kitchen name, giá, ảnh), gán theo item/nhóm hiển thị. Có toggle chọn 1 hay nhiều, bắt buộc/tùy chọn, min (chỉ khi bắt buộc), max, default. Giá âm được hỗ trợ (vd −1.00 "no cheese"). [TL] |
| Toast | Modifier group có Required / Optional-force show / Optional. Min chỉ có ở nhóm required. Max khi cho chọn nhiều. Cho phép chọn trùng modifier (duplicate). [TL] |
| Toast (size) | Size pricing: mỗi size một tên + giá riêng; báo cáo không tách theo size, muốn tách thì tạo món riêng. [TL] |
| Toast (pricing) | Base price / Size pricing / Open price / Weighed (base price + prompt quantity). Giá theo menu (menu-specific), giá theo thời gian (happy hour). [TL] |
| Foodics | Combo = nhiều group, mỗi group nhiều option; chỉ bán 1 option/group; giá combo = tổng giá option đã chọn; size là cột trong bảng combo. [TL, chỉ đọc snippet, trang trả 402] |
| Odoo (third-party module) | Combo group cho chọn nhiều, có max/category. Không tìm thấy luật extra-price trong Odoo POS chính thức. [TL-yếu, module bên thứ ba] |
| Speedline | Số topping có thể phụ thuộc size (cờ "Sized" trên topping matrix). [TL, snippet] |
| Deliverect | Nhóm topping có min/max riêng, tên hiển thị với khách. [TL, snippet] |
| KiotViet / Sapo / iPOS / CukCuk / POS365 | không tìm thấy hướng dẫn menu đọc được. |

- **Các bước** (logic chung đã thấy ở Square/Toast) [SL + TL]
  1. Tạo món (danh mục → món) [SL].
  2. Gắn biến thể size: mỗi size tên + giá riêng [TL Toast].
  3. Tạo nhóm tùy chọn (modifier group/set): tên hiển thị khách + tên bếp, bắt buộc/tùy chọn, min/max, default [TL Square, Toast].
  4. Tạo tùy chọn trong nhóm: giá cộng (dương) hoặc giảm (âm) [TL Square].
  5. Gán nhóm vào món hoặc nhóm món [TL Square].
  6. Gán giá theo kênh/menu và giá theo giờ bằng menu riêng hoặc rule thời gian [TL Toast].
  - Màn hình: thường là back-office (web) để dựng menu; POS chỉ chọn lúc order [SL].

- **Trạng thái** (món hết): Square: đánh dấu modifier hết hàng thì ẩn ở checkout, trạng thái lan sang Square Online [TL]. Toast: không tìm thấy luật 86 đọc được. Lightspeed: chỉ tìm được qua bên thứ ba (Bopple/storekit cho Kounta), không phải Lightspeed Restaurant [TL-yếu].

- **Luật nghiệp vụ**
  - Required + chưa chọn ⇒ món không gửi bếp được [TL Toast: "won't be able to send this item to the kitchen"]. 
  - Min chỉ áp dụng cho nhóm required; optional không có min [TL Toast, Square].
  - Max áp dụng khi cho chọn nhiều [TL Toast, Square].
  - Required + kênh không hiển thị nhóm đó ⇒ đơn online vẫn qua nhưng thiếu lựa chọn; required + kênh có hiển thị mà chưa chọn ⇒ đơn fail [TL Toast platform guide: "order will fail if a modifier from the group has not been selected"].
  - Toast: số modifier hiển thị theo kênh phải ≥ min, nếu không khách không hoàn tất đơn được [TL Toast].
  - Square: modifier nhóm bắt buộc, min > 1 được [TL].
  - Giá âm hợp lệ, trừ thẳng khỏi hóa đơn và phiếu bếp [TL Square].
  - Square: không cho cùng lúc "conversational modifiers" với "allow multiple quantities" [TL].
  - Toast: size pricing không hỗ trợ tăng giá hàng loạt như base price [TL].
  - Toast Online / Catering Online: không hỗ trợ open price [TL].
  - Toast Web: cách dựng combo chi tiết không tìm được (chỉ có Foodics).

- **Ca khó / ngoại lệ**
  - Món bán theo cân: Square for Restaurants **không có** cân native (chỉ có workaround: nhiều variant cố định 1/4, 1/2 lb, hoặc open-price item) [TL community Square, không phải tài liệu chính thức — cần kiểm lại].
  - Toast: món bán theo cân dùng base price/đơn vị + prompt quantity; có barcode nhúng cân từ cân in tem [TL].
  - Open price: nhân viên nhập giá lúc order; không dùng cho kênh online [TL Toast].
  - Trùng modifier (2× phô mai) phải bật cờ duplicate, nếu không UI không cho chọn lại [TL Toast].
  - Hết món mà còn trên menu kênh online = đơn lỗi/nhận đơn không làm được [TL Square + POSUSA-yếu].
  - Đổi tên món/giá sau khi bán: đơn cũ phải giữ snapshot (xem mục mâu thuẫn) [SL].

- **Quyền**: dựng menu và đổi giá thường chỉ quản lý/chủ; không tìm thấy quy định phân quyền chi tiết (ngoài phạm vi) [không tìm thấy].

- **Ảnh hưởng dây chuyền**: menu/giá ảnh hưởng báo cáo (Toast size không tách báo cáo theo size) [TL]; biến thể gắn với kho/định lượng — ngoài phạm vi, không nghiên cứu.

- **Nguồn**
  - Square modifiers: https://squareup.com/help/us/en/article/6426-modifiers-and-categories-with-square-for-restaurants
  - Square item modifiers (sold out): https://square.com/help/us/en/article/5119
  - Square sell-by-weight (community, cũ): https://community.squareup.com/t5/Read-only-archive-Square/Sell-by-weight-in-Square-for-Restaurants/idc-p/375292
  - Toast required/optional: https://support.toasttab.com/en/article/Required-Optional-Modifiers
  - Toast size/open/base: https://support.toasttab.com/en/article/Setting-Base-Prices-Size-Pricing-and-Open-Pricing-in-the-Menu-Builder
  - Toast weighed: https://support.toasttab.com/en/article/Items-Priced-by-the-Pound-or-Unit
  - Toast channel pricing (qua search): https://doc.toasttab.com/doc/platformguide/adminToastProductChannelSupportForAdvancedPricingFeatures.html
  - Foodics combos (snippet): https://foodics.helpjuice.com/560915-combos-overview
  - Deliverect product types: https://developers.deliverect.com/page/product-types

### A2. Tạo đơn & vòng đời đơn theo kênh

- **So sánh cách làm**

| Hệ thống | Cách làm đã đọc được |
|---|---|
| Toast | Dining option = kiểu quy trình, phải gắn đúng 1 hành vi: Dine In / Takeout / Delivery / Curbside / Drive-thru. Dining option quyết định bếp đóng gói hay trình bày; course pacing chỉ với Dine In. Orders Hub lọc đơn mang đi/giao. [TL] |
| Toast Mobile Order & Pay (QR tại bàn) | Cần dining option Dine In + service area + bàn có QR. Khách tự gọi, tự trả (tab thường hoặc pay-as-you-go theo đơn). Khách KHÔNG sửa đơn sau khi gửi; muốn đổi lớn thì quản lý hủy và tạo đơn mới. Mất mạng ⇒ không xử lý order/thanh toán qua QR, server nhận order trực tiếp. [TL] |
| Square for Restaurants | Group ordering (bistro): nhóm khách gọi tại quầy, mỗi người trả riêng, bếp nhận 1 ticket gộp khi giỏ trống. Chỉ gói Plus/Premium, bật quick service/full service/bar. [TL help article] |
| Square (lưu đơn) | Lưu check mở, gắn tên, mở lại khi khách trả; "Send" trước khi "Save" để gửi bếp. Gói Free không có cách giữ đơn/món. [TL-yếu: community forum, không phải help chính thức] |
| Square KDS | Không tìm thấy trạng thái món trên KDS/bump đọc được; thread cộng đồng chỉ nêu trạng thái đơn New / In Progress / Ready / Picked Up / Complete (trên trang Orders online). [TL-yếu] |
| KiotViet, Sapo, iPOS, CukCuk, POS365 | không tìm thấy (flow quầy trả trước / thẻ rung / bàn trả sau đọc được). |

- **Các bước** (chuỗi chung thấy ở Toast/Square) [TL + SL]
  1. Chọn kiểu phục vụ (dining option) trước hoặc khi mở đơn — POS nhân viên; kênh online khách chọn [TL Toast].
  2. Nếu tại bàn: chọn bàn/khu (xem A3); nhập số khách [TL Toast FAQ: số khách nhập khi server tạo đơn].
  3. Nhập món, modifier (xem A1), ghi chú món.
  4. Gửi bếp (Send) — hoặc giữ, hoặc gửi theo course (xem A4) [TL Toast].
  5. Trả: trả sau (tab/bàn) hoặc trả trước (đơn tại quầy, lấy số/tên) [SL cho quầy; không tìm thấy tài liệu quầy trả trước đọc được].
  6. Đóng đơn sau khi đã thanh toán đủ (xem A5).
  - Khách tự gọi QR: khách quét, chọn món, trả ngay trên điện thoại; không cần server duyệt được tài liệu nêu [TL Toast FAQ].

- **Trạng thái**
  - Đơn: Open ⇄ Sent (đã gửi bếp) ⇄ Paid/Closed; đơn lưu lại (saved) chưa gửi bếp [TL-yếu Square, SL cho tên].
  - Đơn online Square: New → In Progress → Ready → Picked Up/Complete [TL-yếu, community].
  - Món: không tìm thấy bảng trạng thái món (chờ/đang làm/xong/hold) đọc được cho Square; Toast có Hold/Send/Stay và trạng thái HOLD trên KDS (xem A4) [TL Toast].
  - Không tìm thấy trạng thái chuyển đổi đầy đủ cho KiotViet/Sapo/iPOS/CukCuk.

- **Luật nghiệp vụ**
  - Toast: dining option phải có hành vi; mỗi option đúng 1 behavior [TL].
  - Toast QR: bàn trùng tên không có QR; tên bàn có " H" (space + H hoa) không gán QR hợp lệ [TL Toast].
  - Toast QR: đơn đã gửi không sửa được [TL].
  - Toast QR: rượu bia phải kiểm giấy tờ trước khi phục vụ [TL].
  - Square group order: giỏ phải trống mới gửi 1 ticket bếp; hủy được trước khi có khoản trả nào [TL].
  - Gift card: dùng được cho cả tiền món và tip (Toast) [TL].

- **Ca khó / ngoại lệ**
  - Khách trả trước rồi đơn bị lỗi bếp: không tìm thấy luật hoàn tự động [không tìm thấy].
  - Mất mạng giữa chừng: Toast QR không xử lý đơn/thanh toán; server phải nhận order thủ công [TL].
  - Thẻ từ chối sau khi đã nhận món: server yêu cầu khách nhập lại thẻ tại POS; check chưa "paid" = chưa thu tiền [TL Toast].
  - Square: lưu đơn và quên gửi bếp (không "Send" trước "Save") — rủi ro thiết kế [SL từ thứ tự thao tác].
  - Đơn trùng ticket số: Square thread nói đơn chia nhỏ cho từng khách ra nhiều ticket bếp, người hỏi bị lặp số ticket (thread cũ, không đáng tin hoàn toàn) [TL-yếu].

- **Quyền**: Square group order cần quyền "Orders"; Toast cấu hình dining option cần quyền Web setup Kitchen/Dining Room [TL]. Quyền duyệt hủy/chuyển: không tìm thấy (ngoài phạm vi phân quyền chi tiết).

- **Ảnh hưởng dây chuyền**: dining option ảnh hưởng đóng gói/trình bày bếp và course pacing [TL]; đơn tại quầy/QR đi cùng thanh toán (A5); các đơn online đi qua POS nhưng chi tiết kênh giao (GrabFood) không đọc được trong phạm vi này.

- **Nguồn**
  - Toast dining options: https://doc.toasttab.com/doc/platformguide/adminDiningOptions.html
  - Toast Orders Hub: https://support.toasttab.com/en/article/Order-Hub-Overview?lang=en_US
  - Toast Mobile Order & Pay setup: https://support.toasttab.com/en/article/Setting-Up-Toast-Mobile-Order-and-Pay?lang=en_US
  - Toast Mobile Order & Pay FAQ: https://support.toasttab.com/en/article/Toast-Mobile-Order-and-Pay-FAQs?lang=en_US
  - Square group ordering: https://api.squareup.com/help/au/en/article/8630-set-up-and-manage-group-ordering
  - Square hold/save (community, yếu): https://community.squareup.com/t5/Questions-How-To/Taking-Orders-without-Paying/td-p/229621

### A3. Bàn (sơ đồ, chuyển, gộp, tách, đặt trước)

- **So sánh cách làm**

| Hệ thống | Cách làm đã đọc được |
|---|---|
| Toast | Service area + bàn (bàn tên trùng không dùng QR). Chuyển check sang bàn khác (Table Service / Quick Order). Gộp check: chọn nhiều check Open, check đầu tiên là đích; check đã Paid/Closed không gộp được; quyền "Change Table" (1.16). Chuyển món sang check khác bằng Split > Look Up Check. Long-press bàn khi chuyển có thể gộp luôn. [TL] |
| Odoo 18 POS Restaurant | Actions > Transfer/Merge, chọn bàn đích trên sơ đồ tầng: bàn trống = chuyển; bàn có khách = gộp. Tách bill: bật Allow Bill Splitting, Actions > Split, chọn món, Split Order; đơn tách phải thanh toán trước khi quay lại đơn chính. Table Booking bật để đặt bàn (gắn tài nguyên Appointment). [TL] |
| Square | Group ordering (xem A2) thay cho sơ đồ bàn. Không tìm thấy luật chuyển/gộp bàn đọc được. |
| KiotViet, Sapo, iPOS, CukCuk, POS365 | không tìm thấy. |

- **Các bước** [TL Toast/Odoo]
  1. Mở sơ đồ khu vực, chọn bàn trống hoặc bàn đang có khách.
  2. Chuyển: Actions > Transfer (Odoo) / chọn check > chuyển bàn (Toast) → chọn bàn đích.
  3. Gộp: chọn nhiều check Open ⇒ check đầu là đích, các check còn lại gộp vào (Toast); hoặc Transfer vào bàn có khách ⇒ gộp (Odoo).
  4. Tách: chọn món ⇒ Split ⇒ check mới (Toast Split mode; Odoo Split Order). Chia đều theo số check hoặc theo ghế (chỉ table order, cần món gán ghế lúc gọi) [TL Toast].
  5. Đặt trước: bật Table Booking, đánh dấu bàn đã có người (Odoo) [TL]. Luồng đặt bàn trước cho khách ngoài (SMS/app) không tìm thấy.

- **Trạng thái**: bàn Trống / Có khách (chưa rõ tên trạng thái chính xác trong từng hệ thống) [SL]. Check: Open / Paid / Closed / Voided [TL Toast].

- **Luật nghiệp vụ**
  - Toast chuyển check: chỉ check Open chuyển trực tiếp; server chuyển cần cả hai server đang clock-in [TL].
  - Toast gộp: không gộp check có payment đã áp (Paid/Closed); check có thẻ pre-auth phải chạy thanh toán mới sau khi gộp [TL].
  - Toast chuyển thanh toán đã capture thẻ: không chuyển được; muốn "Move Payment to a Different Check" chỉ với khoản chưa capture [TL].
  - Toast tách món: phí dịch vụ thủ công phải thêm lại trên từng check tách [TL].
  - Toast gộp check: không có quyền riêng, ai có quyền vào Payment Terminal đều gộp được nếu bật tính năng (rủi ro kiểm soát) [TL].
  - Toast chuyển/gộp tính năng bị giới hạn release, cần Customer Care bật [TL].
  - Odoo: món tách phải thanh toán xong trước khi quay lại đơn chính [TL].

- **Ca khó / ngoại lệ**
  - Chuyển check đã gửi bếp: nguồn chưa nêu rõ (Toast không nói) [không tìm thấy].
  - Bàn đích đã có check khi chuyển: Toast hiện lời nhắc chọn cách xử lý (không đọc được chi tiết); Odoo: gộp [TL].
  - Gộp làm rơi đơn đã gửi bếp: không tìm thấy quy định [không tìm thấy]. Rủi ro: món ở ticket bếp cũ vẫn ghi bàn cũ [SL].
  - Tên bàn trùng hoặc đổi số bàn: QR bị hỏng/cần in lại biển [TL Toast].

- **Quyền**: chuyển bàn cần "Change Table" (Toast 1.16); chuyển server 1.17; chuyển món 1.20; chuyển check hàng loạt 3.4 [TL].

- **Ảnh hưởng dây chuyền**: chuyển/gộp không ảnh hưởng kho (ngoài phạm vi); ảnh hưởng báo cáo theo server/ca (chuyển server giữ ca) [TL Toast]; tách bill ảnh hưởng số lượng bill/thanh toán (A5).

- **Nguồn**
  - Toast transfer/combine: https://support.toasttab.com/en/article/Transferring-Items-Checks-and-Payments
  - Toast combine: https://support.toasttab.com/en/article/Combining-Checks-1492892550423
  - Toast manage tables (qua search): https://intercom.help/toast-central/en/articles/9308458-manage-tables-with-toast-pos
  - Odoo 18 Restaurant: https://www.odoo.com/documentation/18.0/applications/sales/point_of_sale/restaurant.html

### A4. Bếp / bar (gửi bếp, định tuyến, KDS, course, sửa/hủy sau gửi)

- **So sánh cách làm**

| Hệ thống | Cách làm đã đọc được |
|---|---|
| Toast | Prep station (Grill, Cold, Bar, Pizza...) gắn máy in hoặc KDS. Gán station theo menu/nhóm, ghi đè theo món/modifier, một món nhiều station. Send to: station + expo / chỉ expo (không gán KDS bếp) / chỉ station. Sequenced fulfillment: expo chỉ nhận khi các station xong (chỉ với "station + expo"). Bar có thể là station riêng. Service area có thể route sang bar/station khác (patio). [TL] |
| Toast course | Hai chế độ: gửi từng course (server Send/Hold/Stay trên POS) hoặc gửi tất cả ngay (có thêm luật fire, một số chỉ có KDS/expo). Course pacing và server item firing không bật cùng lúc. Expediter course firing: expo fire tay. Automated: fire khi course trước xong hoặc theo delay. Phải có course "drinks" nếu bật coursing Required, nếu không món khác bị HOLD trên KDS. [TL] |
| Toast Hold | Ticket HOLD = đã gửi nhưng chưa fire, chỉ hiện trên KDS expo. Community ghi nhận giới hạn của nút Hold. [TL-yếu] |
| Odoo 18 | Preparation Printers: thêm máy in bếp, chọn danh mục sản phẩm; Order gửi bếp; món không có PoS Product Category không in bếp được. Course/fire: không đề cập. [TL] |
| Square | Group ordering ⇒ một ticket bếp gộp (xem A2). Coursing (gói Plus) có thể dùng để giữ ticket, không có chỉ báo hold [TL-yếu, community]. Trạng thái món trên KDS: không tìm thấy. |
| KiotViet, Sapo, iPOS, CukCuk, POS365 | không tìm thấy. |

- **Các bước** (Toast) [TL]
  1. Dựng station trong back-office, gắn máy in/KDS từng station, gán station theo menu/item (Kitchen/Printers, tickets & KDS devices).
  2. Server đặt món ⇒ Send. Nếu coursing: Send/Hold/Stay theo course.
  3. Hệ thống tách món theo station, in/hiện trên KDS đúng station; expo nhận bản đầy đủ nếu có.
  4. Station đánh dấu xong; nếu sequenced, expo chỉ thấy khi tất cả station xong.
  5. Expo bump/hoàn tất; đơn về trạng thái sẵn sàng phục vụ (chi tiết bump không đọc được).

- **Trạng thái**: Toast: món chưa gửi / HOLD (đã gửi chưa fire) / đã gửi station / hoàn tất [TL-yếu]. Các chuyển trạng thái đầy đủ không tìm thấy cho Square KDS.

- **Luật nghiệp vụ**
  - Toast: station "Expediter only" không gán được cho KDS bếp [TL].
  - Toast: sequenced chỉ áp dụng cho station gửi cả hai [TL].
  - Toast: cần thiết bị "auto-firing device" để đơn tự chuyển bếp (Mobile Order & Pay) [TL].
  - Toast: bar không cần gửi expo (station ngoài bếp) [TL].
  - Odoo: không có PoS Product Category ⇒ không in bếp [TL].
  - Toast Kitchen: một station có nhiều máy in cần tạo station trùng (duplicate) [TL].

- **Ca khó / ngoại lệ**
  - Sửa/hủy SAU khi đã gửi bếp: Toast yêu cầu void (món đã Send/Print/Pay); món chưa gửi chỉ xóa [TL]. Không tìm thấy luật có in phiếu hủy lên station [không tìm thấy].
  - Coursing sai tên course drinks ⇒ món HOLD sai trên KDS [TL Toast].
  - Mất mạng / thiết bị KDS offline: Toast Mobile Order & Pay không xử lý đơn; in tickets chỉ khi offline nếu không bật "Always Print Tickets" (liên quan tem) [TL].
  - Gửi bếp nhiều lần (in lại): Toast item label in lại chỉ bằng chọn lại món trên KDS và Print [TL].
  - Món chưa in mà đã fire: không tìm thấy.

- **Quyền**: Toast course firing: server hoặc expo (tùy cấu hình) [TL]. Quyền void sau gửi xem A6.

- **Ảnh hưởng dây chuyền**: course/hold ảnh hưởng thời gian phục vụ (báo cáo) [SL]; routing không liên quan kho (ngoài phạm vi).

- **Nguồn**
  - Toast routing prep stations: https://doc.toasttab.com/doc/platformguide/adminRoutingToPrepStations.html
  - Toast prep station setup: https://support.toasttab.com/en/article/Prep-Stations-Basics?lang=en_US
  - Toast expediter: https://support.toasttab.com/en/article/Setting-Up-an-Expediter?lang=en_US
  - Toast course firing: https://support.toasttab.com/en/article/Course-Firing-Options
  - Toast automated/expo firing: https://support.toasttab.com/en/article/Automated-and-Expediter-Course-Firing?lang=en_US
  - Toast dining options (course chỉ Dine In): https://doc.toasttab.com/doc/platformguide/adminDiningOptions.html
  - Odoo 18 Restaurant: https://www.odoo.com/documentation/18.0/applications/sales/point_of_sale/restaurant.html

### A5. Thanh toán (nhiều phương thức, chia bill, tip, VAT, giảm giá, làm tròn)

- **So sánh cách làm**

| Hệ thống | Cách làm đã đọc được |
|---|---|
| Toast | Màn Pay: chọn tip (gợi ý cao nhất trước, Custom tip, No tip); "Other payments" cho gift card, house account, comp card. Chia: split evenly (chọn số check), split by seat (chỉ table order, món gán ghế lúc gọi), split by item (tap món sang check mới, chia món cho nhiều người). Tip hiện trước hay sau khi trả tùy cấu hình thiết bị. Thẻ đã capture không chuyển sang check khác. [TL] |
| Toast Mobile Order & Pay | Tab thường (trả khi đóng) hoặc pay-as-you-go theo từng đơn; gift card dùng được cho cả món và tip; không chấp nhận gift card bên thứ ba; Apple Pay không dùng khi bật tab. [TL] |
| Odoo 18 | Bật Tips trong Payment: nhấn Tip khi thanh toán, nhập số tiền và chọn phương thức trả tip. Tip sau thanh toán chỉ Mỹ, terminal Stripe/Adyen, mức 15/20/25% hoặc nhập số. Tách bill: thanh toán từng phần từng khách. [TL] |
| Square | Group ordering: mỗi khách trả riêng, nhận biên lai riêng (xem A2). [TL] |
| Square, Sapo, KiotViet, iPOS, CukCuk, POS365 (đa nhiều phương thức, tiền thừa, làm tròn, VAT, service charge, giảm giá dòng) | không tìm thấy trong tài liệu đọc được. |

- **Các bước** (Toast) [TL]
  1. Mở check → Pay ($).
  2. Chọn cách chia (nếu có): theo số check (even), theo ghế (table), theo món (item).
  3. Chọn tip (gợi ý / custom / none) — hoặc tip trước/sau tùy cấu hình thiết bị.
  4. Chọn phương thức: thẻ, tiền mặt, hoặc Other payments (gift card, house account, comp).
  5. Thu tiền ⇒ check đóng khi thu đủ trên màn Pay.

- **Trạng thái** (thanh toán): Toast: Paid/Closed; thẻ "captured" không sửa được, phải void hoặc refund (xem A6) [TL].

- **Luật nghiệp vụ**
  - Chỉ check Open mới gộp được; check đã áp thanh toán không gộp [TL].
  - Chia theo ghế chỉ table order [TL].
  - Chia tip theo %: không tìm thấy trong tài liệu Toast; Odoo: 15/20/25% (US) [TL].
  - Gift card tip: dùng được [TL].
  - Phí dịch vụ tách món: thêm thủ công cho từng check [TL].
  - Toast QR: không có quy định số thẻ/hạn mức [không tìm thấy].

- **Ca khó / ngoại lệ**
  - Thẻ bị từ chối sau khi nhận món: yêu cầu nhập lại thẻ tại POS; check chưa "paid" = chưa thu tiền [TL].
  - Chuyển thanh toán đã capture sang check khác: không được [TL].
  - Refund/void cùng ngày vs khác ngày: khác ngày phải refund (xem A6) [TL].
  - Đa phương thức, trả một phần, tiền thừa, làm tròn, giảm giá dòng/đơn, VAT giá đã gồm thuế vs cộng thuế, service charge: **không tìm thấy** trong 2 trang Toast và Odoo đã đọc. Đây là khoảng trống lớn nhất của flow này.

- **Quyền**: void/refund cần 3.31 (same day) hoặc quyền refund; manager override khi server thiếu quyền (xem A6). Chia check cần 1.20; manager có thể bắt nhập passcode khi server dùng split [TL].

- **Ảnh hưởng dây chuyền**: thanh toán đổ vào drawer tiền mặt (ca, A7) và báo cáo payment [TL]. Tip out qua shift review làm giảm tiền két [TL]. Ảnh hưởng kho/điểm thành viên: ngoài phạm vi.

- **Nguồn**
  - Toast managing payments: https://support.toasttab.com/en/article/New-POS-Managing-Payments?lang=en_US
  - Toast split checks: https://support.toasttab.com/en/article/Splitting-Checks-by-Item-1492811097734
  - Toast Mobile Order & Pay FAQ: https://support.toasttab.com/en/article/Toast-Mobile-Order-and-Pay-FAQs?lang=en_US
  - Odoo 18 Restaurant (tips, split): https://www.odoo.com/documentation/18.0/applications/sales/point_of_sale/restaurant.html

### A6. Hủy / hoàn

- **So sánh cách làm**

| Hệ thống | Cách làm đã đọc được |
|---|---|
| Toast | Món chưa gửi (chưa Send/Print/Pay): xóa, không void. Món đã gửi: Void (chọn món → Void → xác nhận → lý do nếu được hỏi). Đã thanh toán: void cùng ngày kinh doanh (tiền mặt "Void", thẻ "Adjust"), khác ngày = refund. Void cả check khi chưa có payment capture; check void không mở lại. Lý do void phải cấu hình sẵn trong Toast Web. Báo cáo: Voided orders, Voided payments, "Voids by Approver". [TL] |
| Toast (duyệt) | Quyền 3.31 (void/refund cùng ngày). Để bắt manager duyệt: gỡ quyền 3.32, 3.8 khỏi job server; khi đó manager phải thực hiện. Thiết bị không nhận tiền mặt cần bật riêng để void tiền mặt. [TL] |
| Toast (sửa đã thanh toán) | Void thanh toán trước, mở lại check, void món, thu tiền mới. [TL] |
| Odoo, Square, KiotViet, Sapo, iPOS, CukCuk, POS365 | không tìm thấy luật hủy/hoàn đọc được (Square: không tìm thấy trang help chính thức). |

- **Các bước** (Toast) [TL]
  1. Chọn món hoặc check ⇒ Void (hoặc Void Order nếu chưa có payment).
  2. Chọn lý do (bắt buộc nếu cấu hình).
  3. Nếu thiếu quyền ⇒ manager override/duyệt.
  4. Hệ thống ghi vào báo cáo void.

- **Trạng thái**: món: chưa gửi → đã gửi → void; check: Open → Voided (không mở lại nếu chưa có payment) [TL].

- **Luật nghiệp vụ**
  - Void chỉ trong cùng ngày kinh doanh; khác ngày phải refund [TL].
  - Check void không mở lại; cần tạo check mới [TL].
  - Lý do void phải có trước (Toast Web > Payments > Transactions & refunds > Void reasons) [TL].
  - Refund một phần: không tìm thấy trong tài liệu Toast đã đọc.

- **Ca khó / ngoại lệ**
  - Hủy món đã gửi bếp: phải void, bếp cần biết (Toast không nêu rõ có in phiếu hủy lên station) [TL/không tìm thấy].
  - Hủy sau khi thanh toán: phải void thanh toán trước, sửa, thu lại [TL].
  - Void tiền mặt trên két đã đóng: cần quyền 4.1, có thể cần duyệt [TL].
  - Trả nguyên liệu về kho khi hủy: Toast không đề cập; thuộc phạm vi kho (ngoài phạm vi, ghi nhận khoảng trống) [không tìm thấy].
  - Hủy vượt ca: không void được, phải refund [TL].

- **Quyền**: void cùng ngày 3.31; duyệt manager qua gỡ 3.32/3.8; xem báo cáo void 4.x [TL]. Ai được duyệt ngoài manager: không tìm thấy.

- **Ảnh hưởng dây chuyền**: void đi vào báo cáo "Cash and loss management" (Toast) [TL]; ảnh hưởng két (void tiền mặt không giảm cash in hand theo tài liệu Toast — xem A7) [TL]. Kho: không tìm thấy.

- **Nguồn**
  - Toast voiding: https://support.toasttab.com/en/article/Voiding-Items-Payments-and-Checks?lang=en_US
  - Toast voided items (qua search): https://intercom.help/toast-central/en/articles/11505969-view-and-manage-voided-items-in-toast-web
  - Toast void thanh toán (platform): https://doc.toasttab.com/doc/platformguide/adminVoidingOrders.html

### A7. Ca làm việc & két tiền

- **So sánh cách làm**

| Hệ thống | Cách làm đã đọc được |
|---|---|
| Toast | Két (cash drawer) có 3 trạng thái: active (nhận tiền), open (chỉ nhận Cash In / Pay Out, không nhận thanh toán), closed. Paused khi "Count this drawer later". Đóng két: manager chọn Close drawer > Count bills (đếm theo mệnh giá, có Quick Cash). Pay Out: lấy tiền khỏi két cho mục đích cụ thể (hoàn ứng, nhà cung cấp), không vượt số dư. Cash In/Cash Out ghi vào báo cáo Cash activity audit. Shift review: nhân viên khai doanh thu tiền mặt + tip out trước khi đóng ca. [TL] |
| Toast (chênh lệch) | Expected Deposit = tiền đầu ca + giao dịch tiền mặt + mục nhập tiền. So cột Cash Drawer với Expected Deposit trong Drawer History. Quên tiền đầu ca khi đếm ⇒ két hiện thiếu. Tip Out / Pay Out / Cash Drop làm giảm tiền ⇒ có thể bị hiểu nhầm là thiếu nếu không ghi đúng. [TL] |
| Toast (bàn giao ca) | Chuyển server giữa hai người: cả hai phải đang clock-in; chỉ check Open chuyển trực tiếp; check đã đóng phải mở lại shift review của server cũ. [TL] |
| Odoo, Square, KiotViet, Sapo, iPOS, CukCuk, POS365 | không tìm thấy trong các trang đã đọc. |

- **Các bước** (Toast) [TL]
  1. Mở ca: đầu ca có tiền két (opening float) — Toast ghi tiền đầu ca vào Expected Deposit [TL].
  2. Trong ca: thanh toán tiền mặt tự vào két; Cash In / Pay Out / Tip Out ghi nhận khi phát sinh [TL].
  3. Cuối ca: nhân viên hoàn tất shift review, khai tiền mặt; manager đếm két (Count bills) và đóng [TL].
  4. Đối chiếu Cash Drawer vs Expected Deposit trong Drawer History [TL].
  5. Chênh lệch: sửa qua Update Entries trong Toast Web (ca tuần trước), hoặc reopen ca trên POS (chỉ tuần hiện tại) [TL].

- **Trạng thái**: két: Active / Open / Paused / Closed; ca: đang mở / đã shift review / đóng [TL].

- **Luật nghiệp vụ**
  - Pay Out không vượt số dư két [TL].
  - Reopen ca trên POS XOÁ Tip Out và Cash Collected cũ ⇒ nhân viên phải nộp tiền và nhận tip lại [TL].
  - Ca tuần trước không reopen trên POS được; chỉ Update Entries trong Toast Web [TL].
  - Chỉnh sửa két đã đóng cần quyền 4.12 (Edit Historical Data) [TL].
  - Xem Drawer History/End of Day cần 3.18 + 4.3 [TL].
  - Chuyển thanh toán sang két khác cần 4.1 [TL].
  - Void tiền mặt không làm giảm cash in hand (tiền két bartender tách riêng) [TL].
  - Thời gian khóa ca: không tìm thấy; chỉ có ranh giới tuần kinh doanh [TL].

- **Ca khó / ngoại lệ**
  - Hoàn tất shift review ca hôm trước vào hôm sau ⇒ tiền gộp vào ngày hiện tại, trông như chênh lệch [TL].
  - Quên tính tiền đầu ca khi đếm cuối ca ⇒ thiếu giả [TL].
  - Sửa sai bằng Update Entries làm hồ sơ khó kiểm [TL].
  - Bàn giao ca giữa chừng với check đã đóng: phải mở lại ca của người cũ [TL].
  - Bartender không đóng két, đối chiếu quỹ riêng, ghi tổng vào cash in hand [TL].
  - Chia két nhiều người trong một ca / két dự phòng: không tìm thấy.

- **Quyền**: 4.12 sửa số dư đã đóng; 3.18 + 4.3 xem két và ca; 4.1 chuyển thanh toán sang két khác; quản lý đóng két [TL]. Ai duyệt Pay Out: không tìm thấy.

- **Ảnh hưởng dây chuyền**: két ảnh hưởng báo cáo Cash and loss management và End of Day [TL]; tip out ảnh hưởng lương/tip (ngoài phạm vi); kho/giá vốn: ngoài phạm vi.

- **Nguồn**
  - Toast cash drawer & shift review troubleshooting: https://support.toasttab.com/en/article/Cash-Drawer-and-Shift-Review-Troubleshooting?lang=en_US
  - Toast cash management (manager): https://support.toasttab.com/en/article/Manager-Activities-Cash-Management-1493049150424
  - Toast cash drawer states (qua search): https://intercom.help/toast-central/en/articles/9307574-cash-drawer-states-overview
  - Toast POS cash drawer operations: https://doc.toasttab.com/doc/platformguide/adminCashDrawerPOSOperations.html

### A8. In ấn

- **So sánh cách làm**

| Hệ thống | Cách làm đã đọc được |
|---|---|
| Toast (tem ly / item label) | Tem một món một tem (mặc định); đơn nhiều số lượng ra nhiều tem. Máy: Epson L90, L100 hoặc Toast TLP400 (không in barcode). Kích thước: Small Vertical 1.5"x3", Small Horizontal 3"x1.5", Medium Horizontal 3"x2", Large Square 3"x3". Nội dung: tên món + tất cả modifier, tên khách, giờ đến hạn, dining option (nếu bật) hoặc số bàn/số ticket. Chỉ Epson L90/L100 mới gộp nhiều món trên một tem (Ticket Type = Kitchen Ticket). Khổ giấy phải Wide 76–80 mm. [TL] |
| Toast (in lại) | Không có tài liệu in lại tem; cách duy nhất: chọn lại món trên KDS và Print. [TL] |
| Toast (ticket bếp) | Không KDS: món gửi tới prep station gắn máy in tem; cần bật "Always Print Tickets" nếu không sẽ chỉ in khi offline. Có KDS: chọn món rồi Print thủ công. [TL] |
| Odoo | Preparation Printers gửi đơn bếp theo danh mục sản phẩm (xem A4). Receipts/bill: không tìm thấy trong trang đã đọc. [TL] |
| Square, KiotViet, Sapo, iPOS, CukCuk, POS365 | không tìm thấy (bill tạm tính, bill thanh toán, mẫu in tùy biến chưa đọc được). |

- **Các bước** (tem Toast) [TL]
  1. Cài máy in tem trong Printer Setup (menu Setup của thiết bị POS).
  2. Chọn khổ giấy Wide; chọn kích thước tem.
  3. Gán máy in tem cho prep station (không KDS) hoặc gán làm máy in receipt của KDS (có KDS).
  4. Bật "Always Print Tickets".
  5. Món gửi bếp ⇒ tem in theo món.

- **Trạng thái**: không tìm thấy trạng thái in (đã in / lỗi / in lại).

- **Luật nghiệp vụ**
  - Mỗi món 1 tem (mặc định) [TL].
  - Kích thước khác 3"x3" mà chưa cài đủ có thể in tem trắng [TL].
  - Small Vertical tự co chữ để vừa modifier [TL].
  - Không in được barcode trên máy tem bếp [TL].

- **Ca khó / ngoại lệ**
  - Tem trắng do chọn kích thước không khớp giấy [TL].
  - Không bật Always Print Tickets ⇒ không in khi online [TL].
  - In lại tem: chỉ chọn lại món trên KDS và Print; không có cách in lại từ bill [TL].
  - Bill tạm tính / in sửa đơn đã in: không tìm thấy.

- **Quyền**: không tìm thấy quy định in lại/mẫu in.

- **Ảnh hưởng dây chuyền**: tem và phiếu bếp đi cùng routing (A4) [TL]; mẫu in tùy biến và bill: ngoài đọc được, ghi khoảng trống.

- **Nguồn**
  - Toast item labels: https://support.toasttab.com/en/article/How-to-Set-Up-Print-Item-Labels?lang=en_US
  - Toast item label quick start: https://support.toasttab.com/en/article/Toast-Item-Label-Printer-Quick-Start-Guide
  - Toast kitchen printer (qua search): https://doc.toasttab.com/doc/platformguide/adminAddKitchenPrinter.html
  - Odoo 18 Restaurant: https://www.odoo.com/documentation/18.0/applications/sales/point_of_sale/restaurant.html

## Khoảng trống — flow/luật không tìm được tài liệu

- **Toàn bộ nhóm VN** (KiotViet FnB, Sapo FnB, iPOS, CukCuk, POS365): help center không index được, trang 404 hoặc không có nội dung menu/bàn/bếp/ca. Chưa có bằng chứng nào cho topping, combo, 86, bàn, KDS, ca. Cần: đăng ký dùng thử hoặc đọc trực tiếp help center từng hãng (cần truy cập thủ công).
- **Foodics** combo: trang trả HTTP 402; chỉ dùng snippet tìm kiếm.
- **Thanh toán nâng cao**: đa phương thức trong một đơn, trả một phần, tiền thừa, làm tròn, VAT giá đã gồm/cộng thuế, service charge, giảm giá dòng/đơn — không tìm thấy trong Toast/Odoo/Square đã đọc.
- **Hoàn/void một phần**, trả nguyên liệu khi hủy, ai duyệt hủy cụ thể (ngoài manager override Toast) — không tìm thấy.
- **Bill tạm tính / pre-check / in lại bill / mẫu in tùy biến** — không tìm thấy (Toast, Square, Odoo).
- **Trạng thái món** trên KDS (new/in progress/ready/bumped) — Square không tìm thấy; Toast chỉ có HOLD/fire.
- **Combo**: luật phụ phí khi đổi món trong combo — không tìm thấy ở Foodics (snippet), Odoo chỉ module bên thứ ba.
- **Giá theo kênh (GrabFood/ShopeeFood)**: Toast chỉ có qua DoorDash guide (cách làm middleware); mark-up tự động không tìm thấy.
- **Menu theo khung giờ** (dayparts): Toast có time-specific pricing (happy hour), nhưng ẩn/hiện món theo giờ không tìm thấy; Lightspeed Restaurant không tìm thấy.
- **Đặt bàn trước (flow đầy đủ)**: chỉ có Odoo Table Booking ở mức bật tính năng.
- **Square 86 Restaurants**: chỉ có modifier hết hàng ở Square help; món hết cho cả item không rõ.
- **Cafe, trà sữa, bakery** — không có tài liệu riêng đọc được (xem mục sau).
- **Square cash drawer / ca** và **Square đóng ca**: không đọc được.
- **Quy định phân quyền chi tiết**: ngoài phạm vi nhưng được nêu ở mức quyền Toast (số quyền).

## Khác biệt giữa các loại quán — chỗ cafe/trà sữa/quán ăn/bar/bakery làm KHÁC nhau thật sự

Dữ liệu thật (đã đọc) chỉ đủ cho vài chênh lệch; các mục còn lại là [SL].

| Chênh lệch | Bằng chứng | Hàm ý cấu hình |
|---|---|---|
| Tem ly / in từng món | Toast item label: 1 tem/món, máy tem riêng; có thể in modifier lên tem [TL] | Trà sữa/cafe: công tắc "in tem ly" + mẫu tem theo món; quán ăn thường không cần. |
| Gửi theo course (khai vị → món chính → tráng miệng) | Toast course pacing chỉ với dining option Dine In [TL] | Quán ăn/nhà hàng: bật coursing; cafe/trà sữa/mang đi: tắt. |
| Mang đi / giao / drive-thru / curbside | Toast 5 hành vi dining option; Odoo eat-in/take-out có thuế khác [TL] | Mô hình phải có behavior, không enum cố định. |
| Bán theo cân / giá mở | Toast: weighed (base price + quantity prompt) và open price [TL]; Square không có cân native [TL-yếu] | Bakery, tiệm thịt/deli, đồ tươi: cần kiểu giá per-unit; bar/quán ăn hiếm dùng. |
| Topping số lượng phụ thuộc size | Speedline (pizza): số topping theo size [TL snippet]; Foodics: size là cột combo [TL snippet] | Pizza/trà sữa có size + topping chung: cần quy tắc theo biến thể. |
| Chế độ quầy nhanh vs bàn | Square chọn quick service / full service / bar khi bật tính năng group ordering [TL] | Quick service (cafe, trà sữa) khác full service (bàn): công tắc chế độ phục vụ. |
| Bar pha chế tách bếp | Toast: bar là prep station riêng, không gửi expo [TL] | Bar/cafe: station pha chế riêng, bếp nóng/lạnh là station khác. |
| Gift card/ house account/ comp | Toast Other payments [TL] | Nhà hàng khách đoàn/ comp nhiều hơn quán nhỏ [SL]. |
| Đặt bàn trước | Odoo Table Booking [TL] | Nhà hàng/bar cao cấp; cafe/trà sữa ít dùng [SL]. |
| Tip | Odoo tip (US) [TL] | Ít liên quan VN [SL]. |

Không tìm thấy: khác biệt riêng cho bakery (ngoài cân), cafe (tem, ca), trà sữa (topping/size đã nêu trong thông tin chung, không có tài liệu đọc được cho quán VN).

## Điểm có thể mâu thuẫn với mô hình đề xuất

Mô hình: Món → Biến thể (size, giá) → Nhóm tùy chọn (min/max/bắt buộc) → Tùy chọn (giá cộng, delta định lượng); Đơn có kiểu phục vụ; dòng đơn snapshot tên/giá; nhiều lần thanh toán trên một đơn; tồn kho từ sổ phiếu; loại quán = dữ liệu mẫu + công tắc.

1. **Chia bill tạo CHECK MỚI, không phải nhiều thanh toán trên một đơn.** Toast split by item/seat/even tạo check con; Odoo "Split Order" tách đơn và yêu cầu thanh toán xong đơn tách trước khi quay lại đơn chính; Square group order tạo nhiều biên lai nhưng một ticket bếp. Mô hình "nhiều lần thanh toán trên một đơn" đủ cho trả một phần nhưng không đủ cho tách món sang đơn khác. Cần cả hai: đơn con (sub-bill) + phân bổ thanh toán. Giai đoạn này chưa rõ có được không khi đơn con đã gửi bếp [không tìm thấy].
2. **Size chỉ là giá không đủ.** Toast: size pricing không tách báo cáo theo size, muốn tách thì tạo món riêng. Mô hình biến thể cần cờ "báo cáo riêng" hoặc chấp nhận biến thể là món phụ. Và topping phụ thuộc size (Speedline) ⇒ nhóm tùy chọn cần điều kiện theo biến thể, mô hình hiện không có.
3. **Delta định lượng và số lượng mỗi topping:** Toast có duplicate modifier (cho chọn cùng một món nhiều lần) — cần cờ cho phép trùng, và giới hạn max theo từng tùy chọn (Oolio: max per option chỉ áp dụng cho required). Mô hình chưa có "giới hạn số lượng cho từng tùy chọn" tách khỏi max của nhóm.
4. **Giá không phải một số:** có open price (nhập lúc order), per-unit + prompt quantity, theo menu/kênh, theo thời gian, size. Mô hình chỉ "giá cộng" và "biến thể giá" không bao quát. Cần kiểu giá (strategy) trên món.
5. **Loại đơn không phải enum cố định:** Toast dining option gắn hành vi (Dine In / Takeout / Delivery / Curbside / Drive-thru) và hành vi quyết định course, bếp đóng gói, tính năng khác. Mô hình "tại bàn/mang đi/giao" thiếu drive-thru/curbside và thiếu gắn hành vi.
6. **Sửa đơn đã gửi bếp:** Toast và QR khách không sửa; phải void có lý do và có manager duyệt. Mô hình "snapshot" dòng đơn phải cho phép sự kiện void/hủy có lý do và không xóa dòng cũ. Square và Toast cho "86" modifier ẩn ở checkout, không xoá tồn tại — lưu trạng thái, đừng xoá.
7. **86 không phải tồn kho:** Square 86 là cờ bán/hiển thị trên modifier/món; Toast không tìm thấy quy tắc 86 đọc được. Nếu mô hình gắn 86 vào tồn kho từ sổ phiếu thì khác với cách 86 hiển thị tại quầy — cần tách "hết hàng thủ công" với "hết theo tồn".
8. **Ca làm và két là tách biệt với đơn:** Toast tính chênh lệch két theo Expected Deposit = tiền đầu ca + giao dịch tiền mặt + cash in/out/pay out/tip out; reopen ca xoá Tip Out và Cash Collected cũ. Mô hình thanh toán chỉ "ghi tiền" không đủ nếu không có ca/két riêng.
9. **Công tắc tính năng có ràng buộc loại trừ:** Toast course pacing và server item firing không bật cùng lúc; Square tắt sort sold-out khi bật conversational modifiers; Square conversational không dùng với multi-quantity. "Công tắc độc lập" sẽ sai; cần bảng ràng buộc giữa công tắc.
10. **Trạng thái món:** mô hình chưa có trạng thái món. Toast có HOLD (đã gửi nhưng chưa fire), station gửi/expo, sequenced fulfillment. Cần trạng thái món theo station, không chỉ trạng thái đơn.
11. **Tên/giá snapshot:** chưa có bằng chứng đọc được về snapshot trong các hệ thống này (không tìm thấy). Chỉ có Square "size pricing không tách báo cáo" và Toast "giá theo menu" — cần snapshot để không đổi lịch sử khi đổi giá.

## Nguồn tổng hợp (đã đọc hoặc thấy qua tìm kiếm)

- Toast: https://doc.toasttab.com/doc/platformguide/adminDiningOptions.html · https://support.toasttab.com/en/article/Required-Optional-Modifiers · https://support.toasttab.com/en/article/Setting-Base-Prices-Size-Pricing-and-Open-Pricing-in-the-Menu-Builder · https://support.toasttab.com/en/article/Items-Priced-by-the-Pound-or-Unit · https://support.toasttab.com/en/article/Course-Firing-Options · https://doc.toasttab.com/doc/platformguide/adminRoutingToPrepStations.html · https://support.toasttab.com/en/article/Transferring-Items-Checks-and-Payments · https://support.toasttab.com/en/article/New-POS-Managing-Payments?lang=en_US · https://support.toasttab.com/en/article/Voiding-Items-Payments-and-Checks?lang=en_US · https://support.toasttab.com/en/article/Cash-Drawer-and-Shift-Review-Troubleshooting?lang=en_US · https://support.toasttab.com/en/article/How-to-Set-Up-Print-Item-Labels?lang=en_US · https://support.toasttab.com/en/article/Toast-Mobile-Order-and-Pay-FAQs?lang=en_US
- Square: https://squareup.com/help/us/en/article/6426-modifiers-and-categories-with-square-for-restaurants · https://square.com/help/us/en/article/5119 · https://api.squareup.com/help/au/en/article/8630-set-up-and-manage-group-ordering
- Odoo 18: https://www.odoo.com/documentation/18.0/applications/sales/point_of_sale/restaurant.html
- Foodics (snippet): https://foodics.helpjuice.com/560915-combos-overview
- Lightspeed/Kounta (third-party, không phải Restaurant): https://help.bopple.com/lightspeed-product-availability

---
