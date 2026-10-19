# Research F — Odoo 18 POS: luật chính xác rút từ mã nguồn

Nguồn: mã nguồn Odoo 18.0 (sparse checkout, chỉ đọc, không chạy). Trích dẫn `addon/path:dòng` + link `https://github.com/odoo/odoo/blob/18.0/addons/<path>#L<dòng>`.
Nhãn: [TL] = thấy trong code (file:dòng). [SL] = suy luận của người viết.
Lưu ý: số dòng theo bản checkout ở thời điểm đọc (2026-10-19); nhánh 18.0 còn nhận commit nên link có thể lệch vài dòng.

## Mục lục
- F1. Vòng đời đơn + đánh số — xong
- F2. Chia bill / chuyển bàn / gộp bàn — xong
- F3. Gửi bếp & hủy món — xong
- F4. Hoàn tiền / trả hàng — xong
- F5. Phiên & két tiền — xong
- F6. Khuyến mãi & tích điểm (pos_loyalty) — xong
- F7. Giá, thuế, làm tròn — xong
- F8. Nhân viên & quyền (pos_hr) — xong
- F9. Kho — xong
- F10. Đồng bộ nhiều thiết bị & offline — xong
- F11. Self-order QR — xong
- Khoảng trống
- Khác biệt giữa các loại quán
- Tác động lên mô hình

---

## F1. Vòng đời đơn + đánh số

Model `pos.order` (bảng `pos_order`), dòng `pos.order.line`, thanh toán `pos.payment`.

### State
- [TL] `state` Selection: `draft`(New) / `cancel` / `paid` / `done`(Posted) / `invoiced`; default `draft` — `point_of_sale/models/pos_order.py:353` https://github.com/odoo/odoo/blob/18.0/addons/point_of_sale/models/pos_order.py#L353
- Chuyển trạng thái:
  - `draft → paid`: [TL] `action_pos_order_paid()` kiểm tổng đã trả = tổng đơn (có dung sai cash rounding, xem F7) rồi `write({'state':'paid'})` — `pos_order.py:794-822`. Server gọi trong `_process_saved_order()` khi client gửi đơn không phải draft — `pos_order.py:190-205`. Ngay sau đó tạo picking kho + hóa đơn nếu `to_invoice`.
  - [TL] Client gửi `state:'paid'` thì server ép lại `draft` trước, rồi mới set `paid` sau khi xử lý xong payment ("paid state will be set later") — `pos_order.py:76-79`. ⇒ Server là trọng tài "đã trả đủ chưa", không tin client.
  - `paid → invoiced`: khi xuất hóa đơn — `pos_order.py:1072`.
  - `paid → done`: [TL] lúc ĐÓNG PHIÊN, mọi đơn `paid` chưa xuất HĐ thành `done` (đã ghi sổ kế toán) — `pos_session.py:468-469`.
  - `draft → cancel`: [TL] `action_pos_order_cancel()` chỉ hủy được đơn `draft` — `pos_order.py:1100-1102`. Client xóa đơn draft đã sync thì server set `cancel` — `pos_order.py:1395-1396`.
- Sửa được ở state nào:
  - [TL] Chỉ `draft` sửa được. `write()` cấm đưa state từ `paid/done/invoiced` về state khác: "This order has already been paid. You cannot set it back to draft or edit it." — `pos_order.py:571-573`.
  - [TL] `sync_from_ui`: đơn đã tồn tại mà state ≠ draft thì BỎ QUA dữ liệu client gửi lên ("sync ignored"), chỉ cập nhật preparation change — `pos_order.py:1180-1192`. ⇒ đơn đã trả là bất biến; muốn sửa = hoàn (F4).
  - [TL] Đơn đã in hóa đơn (`nb_print > 0`) cấm đổi payment — `pos_order.py:591-592`.
  - [TL] Xóa (unlink) chỉ được đơn `draft`/`cancel` — `pos_order.py:543-546`.
  - [TL] Đơn đến server khi phiên đã `closing_control/closed` → tự chuyển sang phiên đang mở khác của CÙNG config; không có thì lỗi "No open session available" — `pos_order.py:36-55, 81-82`. Đây là ca "đơn offline đẩy lên sau khi đóng ca".
- [TL] Client: `finalized = state !== 'draft'`; `isUnsyncedPaid = finalized && typeof id === 'string'` (đã trả nhưng chưa có id server) — `static/src/app/models/pos_order.js:99-113`.
- [TL] Cờ audit: `pos.order.line.is_edited` (dòng bị sửa sau khi đã lưu), `pos.order.has_deleted_line`, `pos.order.is_edited` compute — `pos_order.py:388, 533-536, 1515, 1580-1587`.

### Đánh số
- [TL] `uuid` sinh ở client bằng `uuidv4()` khi tạo đơn — `static/src/app/models/pos_order.js:35`. Là khóa định danh khi offline; server tìm đơn có sẵn theo uuid (`_get_open_order`).
- [TL] `pos_reference` (Receipt Number) = `"SSSSS-LLL-NNNN"`: session id 5 số – `login_number` 3 số – sequence 4 số; tên hiển thị `"Order %s"` — `static/src/app/store/pos_store.js:1141-1180`.
  - `login_number`: [TL] mỗi lần 1 máy/tab đăng nhập vào phiên lấy số mới từ `ir.sequence` mã `pos.session.login_number<id>` — `pos_session.py:364-375`. ⇒ phân biệt các máy cùng phiên.
  - sequence: [TL] đếm ở `localStorage['pos.sequenceNumbers'][config][session]`, tăng dần, xóa số của phiên cũ — `pos_store.js:1113-1139`. ⇒ đếm theo MÁY trong phiên, không theo server. Không cần mạng.
- [TL] `name` (số chứng từ chính thức): khi đơn sang `paid` mà name='/' thì lấy `config_id.sequence_id._next()`; đơn hoàn: `"<tên đơn gốc> REFUND"` — `pos_order.py:564-565, 658-663`. ⇒ số chính thức chỉ cấp ở server, lúc trả xong.
- [TL] `tracking_number` (số gọi món/số thứ tự hiển thị cho khách) = `(session_id % 10)*100 + sequence_number % 100`, zfill 3 — `pos_order.py:57-60`, client `pos_order.js:45-48`. ⇒ 3 chữ số, quay vòng mỗi 100 đơn.
- [SL] Vì sequence đếm theo máy, hai máy cùng phiên có thể ra cùng `tracking_number` → số gọi món KHÔNG duy nhất khi nhiều máy. Odoo chấp nhận.
- [TL] `ticket_code` = 5 ký tự ngẫu nhiên (dùng cho khách tự lấy hóa đơn) + `access_token` uuid — `pos_store.js:1174-1175`.
- [TL] `sequence_number` trên `pos.session` và `pos.order` (help "session-unique") — `pos_session.py:51`, `pos_order.py:343`.

### Ca khó
- Đơn trả xong offline: client giữ trong IndexedDB tới khi có id số (`canBeRemovedFromIndexedDB`) — `pos_order.js:103-105`.
- "Tip later": đơn đã paid vẫn được client gửi lại; server bỏ qua — `pos_order.py:1187-1192`.
- Một lần sync chỉ được hoàn từ 1 đơn gốc: "You can only refund products from the same order." — `pos_order.py:1176-1177`.

---

## F2. Chia bill / chuyển bàn / gộp bàn (pos_restaurant)

Model/trường: `pos.order.table_id` (M2o `restaurant.table`), `pos.order.customer_count`, `pos.order.takeaway` — `pos_restaurant/models/pos_order.py:8-10` https://github.com/odoo/odoo/blob/18.0/addons/pos_restaurant/models/pos_order.py#L8 ; `restaurant.table.parent_id` (bàn ghép), `table_number`, `seats`, `floor_id` — `pos_restaurant/models/pos_restaurant.py:94-106`; `restaurant.floor`. Cờ config `iface_splitbill`, `iface_printbill` — `pos_restaurant/models/pos_config.py:13-14`.

### Chia bill (SplitBillScreen) — `pos_restaurant/static/src/app/split_bill_screen/split_bill_screen.js` https://github.com/odoo/odoo/blob/18.0/addons/pos_restaurant/static/src/app/split_bill_screen/split_bill_screen.js
- [TL] Chia = tạo **đơn MỚI** (`pos.createNewOrder()`), không phải đơn con có FK. Liên kết duy nhất là `newOrder.uiState.splittedOrderUuid = <uuid đơn gốc>` — nằm trong `uiState` ⇒ chỉ ở client, KHÔNG lưu DB (`createSplittedOrder`, ~dòng 100-150). [SL] Báo cáo server không biết 2 đơn từng là một.
- [TL] Đơn mới không gắn bàn; nhận `floating_order_name` = tên đơn gốc + chữ cái: bàn "5" → "5B", "5C"…; tối đa tới "Z" ("You cannot split the order into more than 26 parts!") — `_getSplitOrderName`.
- [TL] Chọn số lượng: bấm dòng tăng qty chuyển +1 mỗi lần (đơn vị groupable); đơn vị không groupable (vd kg) bấm là chuyển trọn; combo chuyển theo cả nhóm (`getAllLinesInCombo`) — `onClickLine`.
- [TL] Dòng chuyển trọn: xóa khỏi đơn gốc, tạo dòng mới (copy `serialize()`, uuid mới) ở đơn mới. Chuyển một phần: đơn gốc `qty` giảm, đơn mới có dòng qty phần chuyển.
- [TL] Trạng thái "đã gửi bếp" (`last_order_preparation_change.lines[preparationKey]`) được CHIA theo: đơn gốc giữ `min(đã gửi, qty còn lại)`, phần đã gửi dư chuyển sang dòng mới ⇒ chia bill KHÔNG làm bếp in lại món — `_getSentQty`, `createSplittedOrder`.
- [TL] Sau chia: sync cả 2 đơn; `originalOrder.customer_count -= 1`; màn hình chuyển sang đơn MỚI để thanh toán.
- [TL] Thanh toán đơn mới xong: màn thanh toán quay về đơn gốc (`payment_screen.js:396-397`); receipt có nút "continue splitting" khi đơn gốc chưa finalized và còn dòng — `pos_restaurant/static/src/overrides/components/receipt_screen/receipt_screen.js:11-23`.
- [TL] Đơn gốc còn lại: chính là đơn bàn cũ, vẫn `draft`, giữ phần dòng chưa chia.
- [TL] Thanh toán từng phần không chia dòng: 1 đơn nhận nhiều `pos.payment` (nhiều phương thức); đơn chỉ `paid` khi đủ tiền (F1). Không thấy "chia đều theo số khách" trong code 18 — [SL] chia đều phải tự làm bằng nhiều payment.
- [TL] Điều kiện gộp dòng (`can_be_merged_with`): cùng product, cùng `note` + `customer_note`, đơn vị groupable, **discount = 0**, giá khớp pricelist + price_extra, không theo lô/serial, cùng `full_product_name`, không phải dòng hoàn, không phải combo, không `skip_change` — `point_of_sale/static/src/app/models/pos_order_line.js:324-359`.

### Chuyển bàn — `pos_restaurant/static/src/overrides/models/pos_store.js:291-352` (`transferOrder`)
- [TL] Bàn đích TRỐNG: chỉ đổi `order.table_id = bàn đích`. Đơn giữ nguyên, trạng thái bếp giữ nguyên.
- [TL] Bàn đích ĐANG CÓ đơn draft ⇒ thành **gộp đơn**: từng dòng của đơn nguồn → nếu có dòng đích `can_be_merged_with` thì cộng qty vào dòng đó; không thì tạo dòng mới ở đơn đích. Trạng thái bếp chuyển theo (`mergePreparationLines`: cộng quantity đã gửi vào dòng đích, đặt nguồn = 0). Rồi **xóa đơn nguồn** (`deleteOrders`) ⇒ server set `cancel` (F1).
- [SL] Ý nghĩa: chuyển/gộp KHÔNG in phiếu bếp mới vì "đã gửi" đi theo dòng. Không thấy ghi lịch sử "chuyển từ bàn X" trên DB (chỉ `table_id` đổi).

### Gộp bàn vật lý (ghép bàn) — `pos_restaurant/static/src/app/floor_screen/floor_screen.js:138-235`
- [TL] Kéo bàn A thả cạnh bàn B ⇒ ghi `restaurant.table.parent_id = B`; nếu A có đơn đang mở thì `transferOrder(A → B)` (gộp như trên). Kéo ra ⇒ `parent_id = null`.
- [TL] Bấm bàn con = mở bàn cha (`onClickTable`, dòng 602-603); `table.getOrder()` trả đơn của cha — `pos_restaurant/static/src/app/models/restaurant_table.js:76-80`. ⇒ ghép bàn = 1 đơn chung trên bàn cha.

### Server: 1 bàn = tối đa 1 đơn draft
- [TL] `_get_open_order` trong restaurant: đơn draft có `table_id` khớp theo `uuid` HOẶC (cùng `table_id` và `state='draft'`) ⇒ 2 máy cùng mở bàn 5 tạo 2 uuid khác nhau thì server ĐÈ vào đơn draft đang có của bàn — `pos_restaurant/models/pos_order.py:12-22`. (Liên quan F10.)
- [TL] `sync_from_ui` với context `table_ids` trả thêm các đơn draft khác của các bàn đó để client cập nhật — `pos_order.py:32-52`.

---

## F3. Gửi bếp & hủy món

Model/trường: `pos.order.last_order_preparation_change` (Char JSON, "Last printed state of the order") — `point_of_sale/models/pos_order.py:322` https://github.com/odoo/odoo/blob/18.0/addons/point_of_sale/models/pos_order.py#L322 ; `pos.order.general_note` (Text, ghi chú cả đơn) `:365`; `pos.order.line.note` (Product Note — ghi chú cho bếp) `:1509`, `pos.order.line.customer_note` (in lên bill khách) `:1504`, `pos.order.line.skip_change` ("Skip line when sending ticket to kitchen printers") `:1465`; `pos.printer.product_categories_ids` (M2m `pos.category`), `printer_type` — `point_of_sale/models/pos_printer.py:13-16`; ghi chú mẫu `pos.note` + `pos.config.note_ids` — `pos_config.py:206`.

### Cơ chế "preparation changes" = diff với ảnh chụp lần gửi trước
- [TL] Ảnh chụp lưu dạng `{lines: {<line.uuid>: {uuid, product_id, name, note, quantity, attribute_value_ids, isCombo}}, generalNote, sittingMode: 'dine in'|'takeaway', metadata: {serverDate}}` — `updateLastOrderChange()` `point_of_sale/static/src/app/models/pos_order.js:327-373`. Khóa dòng `preparationKey = line.uuid` — `pos_order_line.js:64-66`.
- [TL] `getOrderChanges()` so từng dòng hiện tại với ảnh chụp: `quantityDiff = qty hiện tại − qty đã gửi` (dòng chưa từng gửi: toàn bộ qty). Dòng có trong ảnh chụp mà không còn trong đơn ⇒ `quantity = −đã gửi` (hủy). Note đổi ⇒ vào `noteUpdated`. `general_note` đổi ⇒ `generalNote`. Đổi tại chỗ ↔ mang đi khi đã có món gửi ⇒ `modeUpdate` — `point_of_sale/static/src/app/models/utils/order_change.js:41-162` https://github.com/odoo/odoo/blob/18.0/addons/point_of_sale/static/src/app/models/utils/order_change.js#L41
- [TL] `changesToOrder()` tách: `new` (diff > 0), `cancelled` (diff < 0, lấy trị tuyệt đối) — `order_change.js:1-33`.
- [TL] Chỉ tính món thuộc `pos.category` mà có máy in nhận (`orderPreparationCategories` = tập category của các printer); không cấu hình category nào thì mọi món — `order_change.js:56-60`, `pos_store.js:1101-1106`.
- [TL] Sau khi gửi: ảnh chụp cập nhật = qty hiện tại, `line.saved_quantity = qty`, `metadata.serverDate = now` — `pos_order.js:327-373`.

### Máy in theo nhóm món — `printChanges` `point_of_sale/static/src/app/store/pos_store.js:1771-1844`
- [TL] Lặp mỗi `pos.printer`; lọc thay đổi theo `product_categories_ids` (khớp cả category cha: `parentPosCategIds`) — `_getPrintingCategoriesChanges` `pos_store.js:1914+`.
- [TL] Thứ tự in: combo trước, sau đó theo `pos_categ_sequence` (thứ tự nhóm món) — `pos_store.js:1777-1788`. [SL] Đây là thay thế thô cho "course": món khai vị in trước theo sequence nhóm, nhưng không có lệnh "gọi món lượt 2".
- [TL] Mỗi máy in có thể ra các phiếu tiêu đề: "New" (món mới), "Note" (đổi ghi chú), "Cancelled"/"Cancel", "Message" (ghi chú chung, chỉ khi có món mới) — `preparePrintingData` `pos_store.js:1883-1912`.
- [TL] Hủy món đã gửi: phiếu "Cancel" nếu toàn bộ món đã gửi bị hủy hết (hủy cả đơn), ngược lại "Cancelled" (hủy một phần); in kèm món mới nếu cùng lượt — `pos_store.js:1890-1910`.
- [TL] Phiếu bếp có: số bàn, tên config, giờ HH:mm, `tracking_number`, cờ takeaway, tên nhân viên, ghi chú đơn — `getPrintingChanges` `pos_store.js:1846-1857`.
- [TL] In lỗi ⇒ popup "Printing failed"; vẫn cập nhật ảnh chụp (`updateLastOrderChange` gọi sau try/catch) — `pos_store.js:1738-1760`. [SL] ⇒ in hỏng thì bếp mất phiếu mà hệ thống tưởng đã gửi — rủi ro thật.
- [TL] Gửi bếp khi OFFLINE bị chặn: ném `ConnectionLostError` — `pos_store.js:1762-1769`.
- [TL] Hủy cả đơn đã gửi bếp (xóa đơn có id server + ảnh chụp không rỗng) ⇒ tự gửi phiếu hủy (`cancelled=true`: mọi dòng trong ảnh chụp thành `cancelled`) rồi `action_pos_order_cancel` — `pos_store.js:512-545`.

### "Giữ lại chưa gửi" (skip_change / hold & fire thô)
- [TL] `toggleSkipChange()` trên dòng: dòng `skip_change` không tính vào thay đổi gửi bếp và không vào ảnh chụp; bàn hiển thị số món chờ (skipped) — `pos_restaurant/static/src/overrides/models/pos_order_line.js:22-27`, `pos_restaurant/static/src/overrides/models/pos_store.js:52-72`. [SL] Bỏ cờ sau đó và bấm gửi ⇒ món ra bếp: đây là cơ chế "giữ món/gọi sau" duy nhất.
- [TL] Course: grep "course" trong `point_of_sale`, `pos_restaurant`, `pos_self_order` (bản 18) — KHÔNG có kết quả ⇒ bản 18 community KHÔNG có course.

### Hủy món — có cần quyền/lý do không
- [TL] Bản community: giảm qty / xóa dòng đã gửi KHÔNG cần quyền, KHÔNG có lý do; chỉ sinh phiếu "Cancelled" cho bếp ở lần gửi kế. Móc `disallowLineQuantityChange()` trả `false` — `pos_store.js:1620-1622`.
- [TL] Khi móc đó bật (các module tài chính theo nước override; không có trong checkout): giảm dưới `saved_quantity` KHÔNG sửa dòng cũ mà tạo **dòng âm mới** (`handleDecreaseLine`/`getNewLine`) — `point_of_sale/static/src/app/screens/product_screen/order_summary/order_summary.js:216-290`. [SL] Đây là mô hình "hủy món = bút toán bù, không xóa" — đúng cái đợt 1 đề xuất.
- [TL] Audit: dòng sửa sau khi lưu ⇒ `is_edited`; xóa dòng ⇒ `has_deleted_line` (F1). Không có trường lý do hủy.

### Đa máy
- [TL] Trước khi gửi bếp đơn đã có id, client hỏi server `get_preparation_change`; nếu `serverDate` trên server ≠ local ⇒ cảnh báo "Order Outdated… modified on another device", lấy ảnh chụp của server, sync, KHÔNG in — `pos_store.js:1706-1736`.
- [TL] Server `_ensure_to_keep_last_preparation_change`: ảnh chụp nào có `serverDate` mới hơn thắng; thắng thì server đóng dấu `serverDate = now` — `pos_order.py:1125-1145`. ⇒ chống 2 máy in trùng phiếu.
- [TL] Có màn hình bếp (`pos_preparation_display`, enterprise) thì không sync sau khi in — `pos_store.js:1757`.

---

## F4. Hoàn tiền / trả hàng

Model/trường: `pos.order.line.refunded_orderline_id` (M2o dòng gốc), `refund_orderline_ids` (O2m ngược), `refunded_qty` (compute) — `point_of_sale/models/pos_order.py:1505-1507` https://github.com/odoo/odoo/blob/18.0/addons/point_of_sale/models/pos_order.py#L1505 ; `pos.order.refunded_order_id`, `refund_orders_count`, `has_refundable_lines` (compute) — `pos_order.py:380-382`.

### Luật
- [TL] Hoàn = **đơn MỚI, dòng qty ÂM**, mỗi dòng trỏ `refunded_orderline_id` về dòng gốc. Không sửa đơn gốc (đơn gốc đã bất biến, F1).
- [TL] `refunded_qty` = −Σ qty các dòng hoàn **không ở state cancel** — `pos_order.py:1535-1538`. ⇒ đơn hoàn draft (chưa trả) VẪN chiếm số lượng hoàn được; chỉ hủy mới trả lại hạn mức.
- [TL] Còn hoàn được = `line.qty − line.refunded_qty`; nhập vượt ⇒ chặn — `point_of_sale/static/src/app/screens/ticket_screen/ticket_screen.js:193-212`. `has_refundable_lines` = có dòng `qty > refunded_qty` — `pos_order.py:430-434`.
- [TL] Hoàn một phần: chọn từng dòng + qty trên TicketScreen. Dòng hoàn copy `price_unit`, `discount` (%), `tax_ids`, lô/serial từ dòng gốc, `price_type:'automatic'` — `ticket_screen.js:256-271`. ⇒ giá hoàn = giá đã bán (snapshot), không lấy giá hiện hành.
- [TL] Combo: dòng hoàn con được link lại vào dòng hoàn cha — `ticket_screen.js:274-285`.
- [TL] Đơn hoàn thừa kế `fiscal_position_id`, `takeaway`, khách của đơn gốc; fiscal position không còn được load ⇒ chặn — `ticket_screen.js:252, 287-300`.
- [TL] Một đơn hoàn chỉ được lấy dòng từ MỘT đơn gốc (server chặn) — `pos_order.py:1176-1177, 1221-1223`. Client có thể dồn dòng hoàn vào đơn đang bán (đổi hàng: vừa trả vừa mua trong 1 đơn) trừ khi `doNotAllowRefundAndSales()` (mặc định `false`) — `ticket_screen.js:238-249`, `pos_store.js:2286-2288`.
- [TL] Tên đơn hoàn: `"<name gốc> REFUND"`; giữ cùng `pos_reference` với đơn gốc — `pos_order.py:658-663, 1257-1270`.
- [TL] Hoàn từ backend (`_refund()`): bắt buộc có phiên đang mở của CÙNG config ("To return product(s), you need to open a session…"); copy TẤT CẢ dòng với `qty = −(qty − refunded_qty)` — `pos_order.py:1293-1318, 1540-1563`.
- [TL] Kế toán: hóa đơn hoàn là `out_refund`, `reversed_entry_id` = hóa đơn gốc — `pos_order.py:838, 850-852`. Hoàn toàn bộ thì so với `amount_paid` của đơn gốc (để khớp làm tròn tiền mặt), hoàn một phần thì theo giá trị món — `pos_order.py:708-714`.
- [TL] Quyền: grep "refund" trong `pos_hr/static/src` và `pos_hr/models` — KHÔNG có kết quả ⇒ pos_hr không khóa hoàn tiền theo vai trò ở bản 18. [SL] Bất kỳ thu ngân nào cũng hoàn được; đây là lỗ hổng nên thiết kế khác.

### Hoàn đơn có giảm giá / khuyến mãi / điểm
- [TL] Giảm giá % trên dòng: đi theo dòng hoàn (copy `discount`).
- [TL] Giảm giá toàn đơn (pos_discount) là một DÒNG sản phẩm giảm giá giá âm (F7) ⇒ [SL] hoàn phải chọn cả dòng đó thủ công theo tỷ lệ; code không tự phân bổ.
- [TL] pos_loyalty: dòng thưởng (`is_reward_line`) không coi là dòng hoàn (`is_refund()` loại reward) — `pos_loyalty/static/src/overrides/models/pos_order_line.js:103-105`, `pos_loyalty/models/pos_order_line.py:31-32`.
- [TL] CẤM hoàn dòng nạp/thưởng của chương trình eWallet hoặc gift card: "Refunding a top up or reward product for an eWallet or gift card program is not allowed." — `pos_loyalty/static/src/overrides/components/ticket_screen/ticket_screen.js:7-45`.
- [TL] Điểm: khi tính điểm, dòng qty âm cũng được tính (điểm âm) — comment "Should also count the points from negative quantities. For example, when refunding an ewallet payment" — `pos_loyalty/static/src/overrides/models/pos_order.js:631-634`. Chi tiết ở F6.
- [TL] Có nút "Refund with eWallet" (hoàn tiền vào ví) — `pos_loyalty/static/src/overrides/components/control_buttons/control_buttons.js:44`.

---

## F5. Phiên & két tiền

Model/trường: `pos.session` — `state`, `cash_register_balance_start`, `cash_register_balance_end` (lý thuyết), `cash_register_balance_end_real` (đếm thực), `cash_register_difference`, `opening_notes`, `closing_notes`, `login_number`, `sequence_number`, `rescue`, `update_stock_at_closing`, `statement_line_ids` (cash in/out = `account.bank.statement.line`) — `point_of_sale/models/pos_session.py`. Config: `pos.config.cash_control` (compute: có PTTT `is_cash_count` là bật), `set_maximum_difference`, `amount_authorized_diff` — `pos_config.py:129-130, 177-180, 302`.

### State
- [TL] `opening_control` → `opened` ("In Progress") → `closing_control` → `closed` ("Closed & Posted"), default `opening_control` — `pos_session.py:21-26, 46-49` https://github.com/odoo/odoo/blob/18.0/addons/point_of_sale/models/pos_session.py#L21
- [TL] Mở: `set_opening_control(cashbox_value, notes)` chỉ chạy khi `opening_control`; set `opened`, `start_at=now`; nếu có PTTT tiền mặt: ghi chatter "Opening cash difference" = tiền đếm − `cash_register_balance_start`, rồi ghi đè start = tiền đếm; tên phiên lấy từ `ir.sequence` `pos.session` — `pos_session.py:1760-1794`.
- [TL] Tiền đầu ca gợi ý = `cash_register_balance_end_real` của phiên trước cùng config — `action_pos_session_open` `pos_session.py:377-385`. [SL] ⇒ két chuyển ca nối tiếp; chênh lệch đầu ca được ghi nhận nhưng không chặn.
- [TL] Một config chỉ có MỘT phiên chưa đóng (bỏ qua phiên `rescue`): "Another session is already opened for this point of sale." — `pos_session.py:295-303`. Phiên không được bắt đầu trước ngày khóa sổ kế toán — `:305-313`.
- [TL] Nhiều máy CHUNG một phiên: đúng — mỗi máy đăng nhập lấy `login_number` mới (F1), cùng `session_id`. Phiên gắn với `pos.config` (một "quầy"), không gắn với máy.

### Cash in/out
- [TL] `try_cash_in_out(_type 'in'|'out', amount, reason, extras)` tạo `account.bank.statement.line` trên journal tiền mặt, `payment_ref = "<phiên>-<loại>-<lý do>"`; không có PTTT tiền mặt ⇒ lỗi — `pos_session.py:1853-1874`.
- [TL] Nút cash move chỉ hiện khi `cash_control` và user có quyền `_has_cash_move_perm` — `point_of_sale/static/src/app/navbar/navbar.js:56-58`; với pos_hr thêm điều kiện nhân viên `_role == 'manager'` — `pos_hr/static/src/overrides/models/Chrome.js:4-8`.

### Đóng ca
- [TL] `cash_register_balance_end = start + tổng tiền mặt thu`; `difference = end_real − end` — `pos_session.py:231-249`.
- [TL] Chặn đóng khi còn đơn `draft`: "You cannot close the POS when orders are still in draft" (cả ở `_cannot_close_session` và `action_pos_session_closing_control`) — `pos_session.py:390-394, 713-721, 1843-1851`. ⇒ bàn còn mở = không đóng được ca. [SL] Nhà hàng phải hủy/thanh toán hết hoặc… không có cơ chế "chuyển đơn mở sang ca sau".
- [TL] Chặn khi hóa đơn chưa post — `:315-321`. Phiên đã bị máy khác đóng ⇒ thông báo "Session already closed… Rescue Session" — `:722-732`.
- [TL] Chênh lệch PTTT ngân hàng (bank_payment_method_diffs) cần journal có loss/profit account — `:733-749`.
- [TL] Ngưỡng chênh lệch (client `ClosePosPopup.confirm`): chênh = 0 ⇒ đóng; chênh ≠ 0 và `hasUserAuthority()` (là manager HOẶC max |chênh| mỗi PTTT ≤ `amount_authorized_diff`, hoặc không đặt ngưỡng) ⇒ hỏi "Proceed Anyway"; vượt ngưỡng mà không phải manager ⇒ chặn "Please contact your manager to accept the closing difference." — `point_of_sale/static/src/app/navbar/closing_popup/closing_popup.js:82-108, 166-174`. pos_hr: manager phải `_role=='manager'` VÀ `_user_role=='admin'` — `pos_hr/static/src/overrides/components/closing_popup/closing_popup.js:13-22`.
- [TL] `amount_authorized_diff` chỉ gửi lên client khi `set_maximum_difference` — `pos_session.py:803`.
- [TL] Validate: nếu `update_stock_at_closing` thì tạo picking gộp lúc này (F9); tạo bút toán kế toán; ghi chênh lệch két (`_post_statement_difference`); đơn `paid` → `done` — `pos_session.py:426-470`. Bút toán lệch ⇒ rollback toàn bộ và mở wizard — `:448-461`.

### Đơn offline còn treo khi đóng ca
- [TL] Đơn đến server sau khi phiên `closing_control/closed` ⇒ gán sang phiên đang mở của cùng config; không có ⇒ `UserError` "No open session available. Please open a new session to capture the order." — `pos_order.py:36-55`. [SL] ⇒ máy offline cầm đơn đã thu tiền sẽ treo ở client tới khi có phiên mới; doanh thu rơi sang ca sau.
- [TL] Trường `rescue` ("Auto-generated session for orphan orders") còn tồn tại nhưng grep `'rescue': True` trong point_of_sale/pos_restaurant/pos_self_order KHÔNG ra chỗ tạo ⇒ bản 18 không còn tự tạo phiên cứu hộ — `pos_session.py:85-88`.

---

## F6. Khuyến mãi & tích điểm (pos_loyalty + loyalty)

Nguồn: model gốc nằm ở addon `loyalty` (KHÔNG có trong sparse checkout) — đã tải raw 5 file `loyalty/models/{loyalty_program,loyalty_rule,loyalty_reward,loyalty_card,loyalty_history}.py` nhánh 18.0 từ GitHub vào scratchpad (chỉ đọc). Logic POS ở `pos_loyalty/static/src/overrides/models/pos_order.js` (1488 dòng) và `pos_store.js`.

### Mô hình dữ liệu (tên Odoo)
- `loyalty.program`: `program_type`, `trigger` (`auto`/`with_code`), `applies_on` (`current`/`future`/`both`), `date_from`, `date_to`, `limit_usage`+`max_usage`, `pricelist_ids`, `pos_config_ids`, `pos_ok`, `portal_point_name`, `rule_ids`, `reward_ids`, `coupon_ids` — https://github.com/odoo/odoo/blob/18.0/addons/loyalty/models/loyalty_program.py#L58
  - [TL] `program_type` ∈ `coupons`, `gift_card`, `loyalty`, `promotion`, `ewallet`, `promo_code`, `buy_x_get_y`, `next_order_coupons` — `loyalty_program.py:58-66`.
  - [TL] `is_nominative` (bắt buộc có khách) = `applies_on=='both'` HOẶC (`ewallet`/`loyalty` và `applies_on=='future'`) — `loyalty_program.py:196-200`. `is_payment_program` = `gift_card`/`ewallet` — `:202-205`.
- `loyalty.rule` (điều kiện + cách tích): `product_ids`, `product_category_id`, `product_tag_id`, `product_domain`, `any_product`, `valid_product_ids`; `minimum_qty` (default 1), `minimum_amount`, `minimum_amount_tax_mode` (`incl` default / `excl`); `reward_point_mode` (`order` "per order" / `money` "per <tiền> spent" / `unit` "per unit paid"), `reward_point_amount` (>0, CHECK), `reward_point_split`; `mode` (`auto`/`with_code`) + `code` (mã duy nhất trong rule active) — `loyalty_rule.py:34-79` https://github.com/odoo/odoo/blob/18.0/addons/loyalty/models/loyalty_rule.py#L34
- `loyalty.reward`: `reward_type` (`product`/`discount`), `discount`, `discount_mode` (`percent` / `per_order` (số tiền cố định) / `per_point` (tiền mỗi điểm)), `discount_applicability` (`order`/`cheapest`/`specific`), `discount_product_ids/category/tag/domain`, `discount_max_amount` (0 = không trần), `discount_line_product_id` (mỗi reward 1 sản phẩm giảm giá riêng "for reporting purpose"), `tax_ids`, `reward_product_id(s)`/`reward_product_tag_id`, `reward_product_qty`, `required_points` (>0, CHECK), `clear_wallet`, `is_global_discount` (compute) — `loyalty_reward.py:30-114`.
- `loyalty.card` (= thẻ/coupon/gift card/ví): `program_id`, `partner_id`, `points`, `code` (sinh tự động), `expiration_date`, `source_pos_order_id` — `loyalty_card.py:29-44`.
- `loyalty.history` (sổ điểm): `card_id`, `description`, `issued`, `used`, `order_model`, `order_id` — `loyalty_history.py:11-20`. ⇒ [TL] Odoo 18 ĐÃ có sổ phát sinh điểm, nhưng số dư vẫn là trường `points` cộng dồn (không tính từ sổ).
- Dòng đơn: `pos.order.line.is_reward_line`, `reward_id`, `coupon_id`, `reward_identifier_code`, `points_cost` — `pos_loyalty/models/pos_order.py:252-254`.

### Giá trị mặc định theo loại chương trình — `_program_type_default_values` `loyalty_program.py:229-380` [TL]
| program_type | applies_on | trigger | rule mặc định | reward mặc định |
|---|---|---|---|---|
| coupons | current | with_code | (coupon sinh sẵn) | 10% , 1 điểm |
| promotion | current | auto | 1 điểm/đơn, minimum_amount 50 | 10%, 1 điểm |
| gift_card | future | auto | 1 điểm/1 đồng, split=True | discount per_point 1, áp order |
| loyalty | both | auto | per money | 5%, 200 điểm |
| ewallet | future | auto | 1 điểm/1 đồng, split=False | discount per_point 1, áp order |
| promo_code | current | with_code | rule mode with_code | 10% specific |
| buy_x_get_y | current | auto | per unit, minimum_qty 2 | free product, 2 điểm |
| next_order_coupons | future | auto | minimum_amount 100 | 15% order |
⇒ [SL] TẤT CẢ (khuyến mãi, coupon, tích điểm, gift card, ví) là MỘT engine "điểm": rule sinh điểm vào `loyalty.card`, reward tiêu điểm. Khuyến mãi tức thì = điểm sinh và tiêu trong cùng đơn (applies_on=current).

### Điều kiện chương trình áp được — `_programIsApplicable` `pos_order.js:476-514` [TL]
- `trigger=auto`: cần ≥1 rule `mode=auto` (hoặc rule code đã kích hoạt). `with_code`: cần đã nhập mã khớp rule.
- `is_nominative` mà chưa chọn khách ⇒ không áp.
- Ngoài `date_from..date_to` (tính theo ngày, startOf/endOf day) ⇒ không áp. `limit_usage` và `total_order_count >= max_usage` ⇒ không áp.
- `pricelist_ids` không rỗng mà pricelist đơn không thuộc ⇒ không áp.
- Server lọc trước khi tải: `pos_ok`, `pos_config_ids` (rỗng = mọi quầy), ngày, pricelist, max_usage — `pos_loyalty/models/pos_config.py:12-20`.

### Tính điểm — `pointsForPrograms` `pos_order.js:525-707` [TL]
- Bỏ qua dòng giảm giá của chương trình auto khi gom dòng theo rule; bỏ qua dòng thưởng của CHÍNH chương trình đó và của gift_card/ewallet (chống vòng lặp phản hồi) — `:531-549, 597-606`.
- `minimum_amount` so với tổng dòng khớp rule, tax `incl` hoặc `excl` theo `minimum_amount_tax_mode` — `:567-584`. `minimum_qty` so với tổng qty dòng khớp (không đếm dòng thưởng) — `:620-631`.
- Điểm (không split): `order` ⇒ `+reward_point_amount`/đơn; `money` ⇒ `reward_point_amount × Σ giá GỒM THUẾ của dòng khớp` (tính cả dòng giảm giá của chương trình khác nếu khớp rule, vd `any_product`) ⇒ **điểm tính trên tiền SAU giảm giá, GỒM thuế**; `unit` ⇒ `reward_point_amount × qty` — `:683-697`.
- [TL] Làm tròn: `roundPrecision(…, 0.01)` = **làm tròn nửa lên tới 0.01 điểm** (điểm có số lẻ). Comment: "unlike in sale_loyalty this performs a round half-up instead of round down" — `:688-693`. ⇒ POS và kênh bán khác của Odoo làm tròn KHÁC nhau.
- Split (`applies_on=future` + `reward_point_split` + mode ≠ order): mỗi đơn vị sinh 1 thẻ riêng (vd bán 3 gift card ⇒ 3 card) — `:636-681`.
- [TL] gift_card/ewallet chỉ tính điểm từ dòng nạp của chính nó (`ignoreLoyaltyPoints`) — `pos_loyalty/static/src/overrides/models/pos_order_line.js:67-72`.
- [TL] Gift card bán ra: `expiration_date = now + 1 năm` (client gán) — `pos_loyalty/static/src/overrides/models/pos_store.js:250-262`.

### Áp thưởng & chọn khi nhiều chương trình cùng thỏa
- [TL] `getClaimableRewards`: reward claim được khi điểm thẻ ≥ `required_points`; coupons chỉ 1 reward/đơn; chương trình `with_code` phải thỏa rule như điều kiện (`_canGenerateRewards`); bỏ reward discount khi tổng đơn = 0 — `pos_order.js:752-856`.
- [TL] TỰ ĐỘNG áp chỉ khi: chương trình có đúng 1 reward, không nominative, không phải free product nhiều lựa chọn — `pos_store.js:107-117`. Ngược lại (vd loyalty có nhiều mức đổi) ⇒ thu ngân bấm nút "Reward" chọn tay.
- [TL] **Cộng dồn: CÓ** — mọi reward tự động claim được đều được áp lần lượt trong một vòng lặp (`for … of claimableRewards`) — `pos_store.js:107-118`. Ngoại lệ duy nhất: **giảm giá toàn đơn (global discount) không cộng dồn — chỉ giữ cái % cao nhất**: "A better global discount is already applied." — `pos_order.js:858-874`, lọc trước `reward.discount <= globalDiscountPercent` — `:822-824`.
- [TL] Chống giảm vượt: mỗi reward discount tính `totalFactor = min(1, tổng đơn hiện tại / discountable)` ⇒ giảm sau chỉ trên phần còn lại; `discountable = min(tổng đơn, discountable)` — `pos_order.js:1164-1168`. [SL] ⇒ thứ tự áp ảnh hưởng kết quả (giảm % sau giảm cố định khác ngược lại); thứ tự = thứ tự program trong uiState.
- [TL] Thu ngân có thể tắt reward tự động (`uiState.disabledRewards`) — `pos_order.js:819-821`.
- [TL] Sau khi áp reward, điểm được tính lại (reward ảnh hưởng điểm) — `pos_store.js:119-122`.

### Tính số tiền giảm — `_getRewardLineValuesDiscount` `pos_order.js:1146-1248` [TL]
- `order`: mọi dòng `isDiscountable()` có qty, gom base theo nhóm thuế (bỏ thuế fixed) — `:963-985`. `cheapest`: dòng rẻ nhất (không combo con, không reward) — `:990-1017`. `specific`: dòng thuộc `discount_product_*`.
- `percent` ⇒ `discountable × %`; `per_order` ⇒ số tiền cố định; `per_point` ⇒ `discount × điểm` với điểm làm tròn XUỐNG theo bội `required_points` ("Rewards cannot be partially offered"); trần `discount_max_amount` — `:1170-1182`.
- Dòng giảm giá: **mỗi nhóm thuế một dòng âm** dùng `discount_line_product_id`, `is_reward_line=true`, chung `reward_identifier_code` — `:1216-1247`. ⇒ giảm giá phân bổ đúng thuế suất.
- gift_card/ewallet: coi là THANH TOÁN, một dòng âm duy nhất, giá ép "gồm thuế", không chia thuế; `points_cost = số tiền dùng / discount` (dùng một phần số dư được) — `:1186-1214`. `clear_wallet` ⇒ tiêu hết điểm.

### Xác nhận & ghi điểm (server)
- [TL] Lúc bấm Validate thanh toán: nếu dùng thẻ có sẵn ⇒ RPC `validate_coupon_programs` kiểm điểm đủ ("There are not enough points for the coupon"), thẻ còn hiệu lực, mã gift card mới chưa tồn tại — `pos_loyalty/static/src/overrides/components/payment_screen/payment_screen.js`, `pos_loyalty/models/pos_order.py:12-53`. [SL] ⇒ dùng điểm/coupon/ví có sẵn CẦN online.
- [TL] Sau khi đơn sync và state ∉ {draft, cancel}: `confirm_coupon_programs` tạo thẻ mới (`points` khởi 0 rồi cộng), cộng `coupon.points += delta`, ghi `loyalty.history` (issued=won, used=spent, description "Onsite <đơn>") — `pos_store.js:793-820`, `pos_order.py:55-200`. ⇒ điểm chỉ ghi khi đơn đã trả.
- [TL] Nhập mã (`use_coupon_code`): chặn hết hạn (`card.expiration_date < ngày tạo đơn`, hoặc program `date_to`, hoặc hết lượt), chưa hiệu lực, không đủ điểm cho reward nào, sai pricelist, `promo_code` — `pos_loyalty/models/pos_config.py:71-125`. Gift card dùng được dù thẻ gắn khách khác (`partner_id in (False, partner) OR program_type=gift_card`).

### Hoàn điểm khi refund
- [TL] Không hoàn được dòng nạp/thưởng gift card/eWallet (F4).
- [SL] Đơn hoàn có qty âm ⇒ `totalProductQty < minimum_qty` (default 1) ⇒ rule bị `continue` ⇒ **đơn hoàn KHÔNG trừ lại điểm đã tích** trừ khi rule đặt `minimum_qty = 0` (trường hợp đó `money` ra điểm âm). Suy từ `pos_order.js:620-634`; chưa chạy test để xác nhận.
- Không tìm thấy luật "hết hạn điểm loyalty theo thời gian" (chỉ có `expiration_date` trên thẻ, đặt tay hoặc gift card +1 năm).

---

## F7. Giá, thuế, làm tròn

Model/trường: `pos.config.pricelist_id` (mặc định), `available_pricelist_ids`, `use_pricelist`, `iface_tax_included` (`subtotal`/`total` — CHỈ hiển thị), `default_fiscal_position_id`, `fiscal_position_ids`, `tax_regime_selection`, `cash_rounding`, `rounding_method` (`account.cash.rounding`), `only_round_cash_method`, `manual_discount` (Line Discounts, default True), `restrict_price_control` — `point_of_sale/models/pos_config.py:119-189` https://github.com/odoo/odoo/blob/18.0/addons/point_of_sale/models/pos_config.py#L119 ; pos_restaurant: `pos.config.takeaway`, `takeaway_fp_id` — `pos_restaurant/models/pos_config.py:18-23`; pos_discount: `iface_discount`, `discount_pc` (default 10), `discount_product_id` — `pos_discount/models/pos_config.py:11-14`. Dòng: `pos.order.line.price_type` (`original`/`manual`/`automatic`), `discount` (%).

### Pricelist
- [TL] Item được tải: theo pricelist có trong POS + product/template đã tải hoặc rỗng (global) — `point_of_sale/models/product.py:414-424`. Trường dùng: `compute_price` (fixed/percentage/formula), `fixed_price`, `percent_price`, `base` (list_price/standard_price/pricelist), `base_pricelist_id`, `price_discount`, `price_round`, `price_surcharge`, `price_min_margin`, `price_max_margin`, `min_quantity`, `date_start`, `date_end`, `categ_id`, `product_id`, `product_tmpl_id`.
- [TL] Lọc ngày: item ngoài `date_start..date_end` (DATETIME, so với `DateTime.now()` lúc DỰNG CACHE) bị loại — `point_of_sale/static/src/utils.js:166-205`. Cache dựng lại khi load và khi product/pricelist item create/update — `pos_store.js:350-363`. [SL] ⇒ "giờ vàng" bắt đầu giữa ca KHÔNG tự hiệu lực tới khi cache dựng lại (reload/đổi dữ liệu). Rủi ro cho happy hour quán bar/cafe.
- [TL] Ưu tiên rule: lọc `min_quantity <= qty`, rồi chọn theo thứ tự **biến thể (product_id) > template > nhóm (categ, gồm nhóm cha) > rule global đầu tiên** — `point_of_sale/static/src/app/models/product_product.js:213-228`. Giá theo số lượng = `min_quantity`.
- [TL] Tính giá: `lst_price + price_extra` (giá cộng thuộc tính/biến thể), rồi fixed / percentage / formula (giảm %, làm tròn `price_round`, cộng `price_surcharge`, kẹp margin min/max); base có thể là pricelist khác (lồng) — `product_product.js:132-211`. [TL] `price_extra` cộng TRƯỚC khi áp pricelist ⇒ giảm % áp lên cả phần topping/size.
- [TL] Chọn khách ⇒ pricelist = `partner.property_product_pricelist` nếu nằm trong `available_pricelist_ids`, ngược lại `config.pricelist_id`; fiscal position = `partner.property_account_position_id` hoặc default — `point_of_sale/static/src/app/models/pos_order.js:1004-1027`.
- [TL] Đổi pricelist chỉ tính lại dòng `price_type === 'original'` (không đụng dòng sửa giá tay/combos) — `pos_order.js:469-490`.

### Thuế & fiscal position (tại chỗ vs mang đi)
- [TL] pos_restaurant nút Take Away: bật/tắt `order.takeaway`, đổi `fiscal_position_id` giữa `takeaway_fp_id` và `default_fiscal_position_id`, ghi DB nếu đơn đã có id — `pos_restaurant/static/src/app/control_buttons/control_buttons.js:70-82`. Help: "useful for restaurants with onsite and take-away services that imply specific tax rates".
- [TL] Đổi mode sau khi đã gửi bếp ⇒ phiếu bếp báo "Take out"/"Dine in" (`modeUpdate`, F3).
- [TL] Giá gồm thuế hay cộng thuế do `account.tax.price_include` của từng thuế (account), POS chỉ chọn cách HIỂN THỊ (`iface_tax_included`). Tính thuế dùng `accountTaxHelpers` chung với kế toán — `pos_order.js:145-160`. [SL] VN thường giá niêm yết đã gồm VAT ⇒ thuế price_include.

### Làm tròn tiền (cash rounding)
- [TL] `cash_rounding` + `rounding_method` (`account.cash.rounding`: bước `rounding`, `rounding_method` HALF-UP/UP/DOWN).
- [TL] `only_round_cash_method=False` ⇒ làm tròn TOÀN ĐƠN (đưa vào tax totals); `True` ⇒ chỉ làm tròn khi thanh toán bằng PTTT tiền mặt (`is_cash_count`) — `pos_order.js:151-156, 200-205` (`shouldRound`).
- [TL] Server chấp nhận "đã trả đủ" nếu |tổng − đã trả| ≤ nửa bước (HALF-UP) hoặc ≤ 1 bước (UP/DOWN) — `point_of_sale/models/pos_order.py:794-820`. Comment TODO: chưa hỗ trợ trộn tiền mặt + không tiền mặt khi `only_round_cash_method` — `:797`.

### Giảm giá
- [TL] Giảm giá dòng (%): nút numpad "%" chỉ bật khi `manual_discount` — `point_of_sale/static/src/app/screens/product_screen/product_screen.js:161-168`. KHÔNG khóa theo vai trò.
- [TL] Sửa giá dòng: nút "Price" chỉ bật khi `!restrict_price_control || cashier._role == 'manager'` — `pos_store.js:1107-1109`, `product_screen.js:164-167`; pos_hr chặn thêm "You are not allowed to change the price of a product." — `pos_hr/static/src/overrides/screens/product_screen/order_summary/order_summary.js:6-18`. Sửa giá tay ⇒ `price_type='manual'`.
- [TL] Giảm giá toàn đơn (pos_discount): xóa dòng giảm giá cũ, rồi với MỖI nhóm thuế thêm 1 dòng `discount_product_id` giá = −pc% × base (chỉ dòng `isDiscountable()`), thuế = các thuế "can_be_discounted" của nhóm — `pos_discount/static/src/overrides/components/control_buttons/control_buttons.js:23-71`. % kẹp 0..100. Nút hiện khi `module_pos_discount && discount_product_id` — không khóa theo vai trò (`control_buttons.xml:5`).
- [TL] Dòng có discount ≠ 0 không gộp với dòng khác (`can_be_merged_with`) — F2.

---

## F8. Nhân viên & quyền (pos_hr)

Model/trường: `hr.employee.pin`, `hr.employee.barcode`, `user_id`; `pos.config.basic_employee_ids` ("If left empty, all employees can log in"), `advanced_employee_ids` ("Employees with manager access") — `pos_hr/models/pos_config.py:10-15` https://github.com/odoo/odoo/blob/18.0/addons/pos_hr/models/pos_config.py#L10 ; `pos.order.employee_id` + `cashier` (Char, stored compute: tên NV hoặc tên user) — `pos_hr/models/pos_order.py:9-18`; `pos.payment.employee_id` (related đơn, stored) — `pos_hr/models/pos_payment.py:7`; `pos.session.employee_id` (tracking, NV đang đứng quầy) — `pos_hr/models/pos_session.py:9-14`; `account.bank.statement.line.employee_id` (ai rút/nộp tiền) — `pos_hr/models/account_bank_statement.py:8`.

### Đăng nhập
- [TL] Danh sách NV tải về máy: nếu `basic_employee_ids` rỗng ⇒ mọi NV công ty; ngược lại chỉ NV của user hiện tại + basic + advanced — `pos_config.py:38-46`.
- [TL] PIN và badge barcode được băm **SHA1 không salt** rồi gửi về client (`_pin`, `_barcode`) — `pos_hr/models/hr_employee.py:51-61`. Client so `Sha1.hash(input)` — `pos_hr/static/src/app/select_cashier_mixin.js:20-50, 90-124`. ⇒ [SL] đăng nhập hoạt động OFFLINE; nhưng PIN 4 số băm không salt nằm ở trình duyệt là dò được tức thì — không dùng làm bảo mật thật.
- [TL] Quét badge: khớp `_barcode`; nếu NV có PIN thì hỏi thêm PIN — `select_cashier_mixin.js:18-27`. NV không có PIN ⇒ chọn tên là vào.
- [TL] Nút khóa màn (lock) quay về LoginScreen — `pos_hr/static/src/overrides/components/navbar/navbar.xml:13-15`. Đổi thu ngân giữa ca: `set_cashier` ghi `pos.session.employee_id` (online; offline thì đệm `employeeBuffer`, gửi khi có mạng) — `pos_hr/static/src/overrides/models/pos_store.js:13-21, 56-75`.

### Phân cấp quyền (bản 18 chỉ 2 mức + 1 cờ admin)
- [TL] `_role = 'manager'` nếu user của NV thuộc nhóm PoS Manager (`group_pos_manager_id`, kèm `_user_role='admin'`) HOẶC NV nằm trong `advanced_employee_ids`; còn lại `'cashier'` — `hr_employee.py:27-44`. Grep "minimal" trong pos_hr/point_of_sale/pos_restaurant static: KHÔNG có ⇒ bản 18 không có vai trò "minimal".
- Thao tác bị khóa với cashier [TL]:
  - Cash in/out — `pos_hr/static/src/overrides/models/Chrome.js:4-8`.
  - Sửa giá dòng (khi `restrict_price_control`) — F7.
  - Xem cost/margin trong product info — `pos_hr/.../product_info_popup/product_info_popup.js:6`.
  - Sửa thanh toán của đơn đã trả (nút `edit-order-payment` ở TicketScreen; ở ReceiptScreen chỉ khi chưa in) — `pos_hr/.../ticket_screen/ticket_screen.xml:4-6`, `receipt_screen.xml:4-6`.
  - Đóng ca: chỉ manager hoặc NV gắn đúng user mở phiên — `navbar.xml:7-11`; chấp nhận chênh lệch vượt ngưỡng cần `_role=='manager' && _user_role=='admin'` (advanced employee KHÔNG đủ) — F5.
  - Vào backend, tạo sản phẩm từ POS — `navbar.xml:4-6`, `pos_store.js:142`.
- [TL] KHÔNG khóa theo vai trò (đã grep): hoàn tiền (F4), giảm giá dòng % (chỉ cờ config), giảm giá toàn đơn, xóa/giảm món đã gửi bếp (F3), hủy đơn.

### Ghi employee lên chứng từ
- [TL] Đơn mới: `employee_id = cashier hiện tại` — `pos_store.js:46-53`. Đơn chưa có dòng mà đổi thu ngân ⇒ đơn đổi chủ; mỗi lần thêm dòng ⇒ `order.employee_id = cashier hiện tại` (ghi đè cả đơn, `vals.employee_id=false` cho dòng) — `pos_store.js:66-71, 77-89`. ⇒ [TL] **dòng đơn KHÔNG lưu nhân viên**; đơn chỉ nhớ người thêm dòng CUỐI. `pos.payment.employee_id` = related của đơn, không phải người bấm thu tiền.
- [SL] Hệ quả: không truy được "ai gọi món nào / ai hủy món"; báo cáo doanh thu theo NV gán hết cho người chạm cuối. Nhà hàng có phục vụ + thu ngân khác nhau cần thiết kế lại.

---

## F9. Kho

Model/trường: `res.company.point_of_sale_update_stock_quantities` (`closing` "At the session closing" / `real` "In real time", default `real`) — `point_of_sale/models/res_company.py:11-15` https://github.com/odoo/odoo/blob/18.0/addons/point_of_sale/models/res_company.py#L11 ; snapshot vào `pos.session.update_stock_at_closing` lúc tạo phiên — `pos_session.py:93, 345-349`; `pos.config.picking_type_id` (loại phiếu xuất, có `return_picking_type_id`); `stock.picking.pos_session_id`, `pos_order_id`; `pos.order.failed_pickings`, `pos.session.failed_pickings` (compute: có picking chưa done) — `pos_order.py:445`, `pos_session.py:268`; `pos.order.shipping_date` (giao sau).

### Khi nào trừ kho
- [TL] Cấu hình ở cấp CÔNG TY (không phải từng quầy), chốt vào phiên khi mở ⇒ đổi cấu hình không ảnh hưởng phiên đang mở.
- [TL] `real`: mỗi đơn khi chuyển `paid` gọi `_create_order_picking()` ngay trong `_process_saved_order` — `pos_order.py:190-200, 1231-1249`. `closing`: gom dòng mọi đơn đã đóng của phiên theo địa điểm đích, tạo picking lúc validate phiên — `pos_session.py:438-440, 806-827`.
- [TL] Ngoại lệ ép real-time dù cấu hình closing: công ty dùng anglo-saxon accounting VÀ đơn xuất hóa đơn — `pos_order.py:1225-1229`. Đơn có `shipping_date` ⇒ chạy stock rule (giao sau) thay vì picking ngay — `:1235-1236`.
- [TL] Chỉ sản phẩm `type == 'consu'` (hàng hóa) và qty ≠ 0 mới sinh move; dịch vụ/combo không — `point_of_sale/models/stock_picking.py:34`.

### Trả hàng
- [TL] Một đơn có cả qty dương và âm ⇒ tách 2 picking: dương xuất từ `default_location_src_id`; âm dùng `return_picking_type_id` (nếu có) nhập về `default_location_dest_id` của loại trả, không có thì về chính kho nguồn — `stock_picking.py:37-71`. ⇒ hoàn hàng = picking NGƯỢC tự động; đổi hàng (vừa trả vừa mua) ra 2 phiếu.
- [SL] Với F&B, món đã chế biến bị trả vẫn "nhập lại kho" nguyên liệu nếu không cấu hình gì ⇒ cần cờ "hoàn tiền không hoàn kho/ghi hủy".

### Tồn âm
- [TL] `_action_done()` bọc trong savepoint, lỗi `UserError/ValidationError` bị NUỐT (`pass`) ⇒ đơn vẫn thanh toán thành công, picking nằm lại chưa done, cờ `failed_pickings` bật — `stock_picking.py:46-50, 66-70`. [SL] Odoo stock mặc định cho quant âm với hàng không theo lô ⇒ bán quá tồn KHÔNG bị chặn; POS 18 không có kiểm tồn khi bán (grep `qty_available` chỉ thấy ở popup thông tin sản phẩm `point_of_sale/models/product.py:227-228`, chỉ để HIỂN THỊ).
- [TL] "Hết món" trong self-order là cờ tay `product.template.self_order_available`, ghi xong thì đẩy trạng thái tới mọi config self-order (`_send_availability_status`) — `pos_self_order/models/product_product.py:11-33, 126-135`. Không gắn với tồn kho.

### pos_mrp — kit
- [TL] pos_mrp chỉ 2 file nhỏ: tìm BOM `phantom` (kit) để lấy đúng stock move thành phần khi tính giá vốn/lô — `pos_mrp/models/pos_order.py:9-34`, `pos_mrp/models/stock_picking.py:7-12`. Việc NỔ kit thành move thành phần là của `mrp` khi confirm move (bom_type='phantom') — [SL] không có trong checkout, suy từ `move.bom_line_id` được dùng ở `pos_mrp/models/stock_picking.py:9`.
- [TL] Giá vốn kit = Σ giá vốn thành phần × qty/kit — `pos_mrp/models/pos_order.py:23-34`.
- [SL] ⇒ Odoo mô hình "định lượng/công thức món" = BOM kit: bán 1 ly trà sữa trừ trà, sữa, đường, ly theo BOM. Không có bán thành phẩm tồn riêng trong POS (phải dùng MO thật của mrp — ngoài phạm vi POS). Topping/attribute (`product.template.attribute.value`) KHÔNG trừ kho riêng — chỉ có `price_extra` (F7) [SL: không thấy code nào nối attribute với move].

---

## F10. Đồng bộ nhiều thiết bị & offline

File: `point_of_sale/static/src/app/store/devices_synchronisation.js` (229 dòng) https://github.com/odoo/odoo/blob/18.0/addons/point_of_sale/static/src/app/store/devices_synchronisation.js ; `point_of_sale/static/src/app/models/data_service.js` (690 dòng); server `pos.config.notify_synchronisation`, `read_config_open_orders` — `point_of_sale/models/pos_config.py:215-262`; `pos.config.trusted_config_ids` (M2m "tin nhau" giữa các quầy) — `pos_config.py:200`.

### Kiến trúc: "server là nguồn thật, bus chỉ là chuông báo"
- [TL] Sau mỗi `sync_from_ui`, server `notify_synchronisation(session_id, login_number)` bắn sự kiện `SYNCHRONISATION` qua bus/websocket tới config hiện tại và mọi `trusted_config_ids` (login_number=0) — `pos_order.py:1197-1200`, `pos_config.py:215-235`.
- [TL] Máy nhận (`collect`): BỎ QUA nếu `login_number` trùng chính mình hoặc khác phiên; ngược lại gọi `readDataFromServer()` — `devices_synchronisation.js` `collect()`. ⇒ thông báo không mang dữ liệu đơn, chỉ báo "có thay đổi, tự đi đọc".
- [TL] `constructOrdersDomain`: với mỗi bản ghi động đã có id server, hỏi bản ghi có `write_date > write_date local + 1 giây`; riêng `pos.order` hỏi thêm mọi đơn `draft` khác của config mình + trusted config — `devices_synchronisation.js` (≈ dòng 150-200). ⇒ phát hiện thay đổi bằng `write_date`, độ phân giải 1 giây.
- [TL] `read_config_open_orders` trả bản ghi đổi + danh sách id phải XÓA ở client: bản ghi không còn tồn tại và đơn đã `cancel` — `pos_config.py:237-262`.
- [TL] Bàn được mở ⇒ `setTable` gọi `deviceSync.readDataFromServer()` trước — `pos_restaurant/static/src/overrides/models/pos_store.js:198-199`.
- [TL] Đơn mở chia sẻ giữa máy khi `trusted_config_ids` không rỗng hoặc có pos_restaurant (`isOpenOrderShareable`) — `pos_store.js:1635-1637`, `pos_restaurant/.../pos_store.js:358-360`.

### Xung đột
- [TL] Không có khóa (lock) đơn. Quy tắc: **ghi sau thắng ở cấp trường/dòng** — `_process_order` ghi đè lines/payments theo lệnh ORM client gửi (dòng không còn tồn tại bị lọc bỏ) — `pos_order.py:105-123`.
- [TL] Nhà hàng: 2 máy tạo 2 đơn khác uuid cho cùng bàn ⇒ server gộp vào đơn draft sẵn có của bàn (`_get_open_order` theo `table_id`) — F2.
- [TL] Riêng trạng thái gửi bếp có trọng tài theo `metadata.serverDate` (F3) và cảnh báo "Order Outdated" phía client.
- [TL] Đơn đã khác draft trên server ⇒ dữ liệu client bị bỏ qua (F1).
- [SL] ⇒ hai người cùng sửa một bàn có thể mất món của nhau (cảnh báo của Odoo chỉ bắn khi bấm gửi bếp). Thiết kế mới nên có version/lock theo đơn.

### Offline
- [TL] Toàn bộ bản ghi (đơn, dòng, thanh toán…) được ghi vào **IndexedDB** (debounce 200ms) — `data_service.js:44-52, 96-183`. Mở lại trình duyệt ⇒ nạp lại từ IndexedDB — `:185-296`.
- [TL] Sự kiện trình duyệt `offline` ⇒ `network.offline=true`; mọi `execute()` ném `ConnectionLostError` ngay — `data_service.js:54-66, 312-316`.
- [TL] Hàng đợi: lệnh `queue=true` lỗi mạng vào `network.unsyncData`; khi `online` ⇒ `syncData()` phát lại TUẦN TỰ dưới mutex, dừng ở lệnh lỗi đầu tiên (giữ thứ tự) — `data_service.js:548-566`.
- [TL] Đơn: tập `pendingOrder {create, write, delete}` theo id — `pos_store.js:132, 1205-1225`. `syncAllOrders` gửi TỪNG đơn một ("to avoid cancelling all sync when one order fails"), lỗi mạng ⇒ "Offline mode active, order will be synced later" và đơn ở lại pending — `pos_store.js:1275-1350`. Đơn đã trả chưa sync được nạp lại vào pending khi khởi động — `pos_store.js:270, 592`.
- [TL] Bán + thu tiền offline được (số phiếu sinh ở client, F1). KHÔNG làm được offline: gửi bếp (F3), dùng điểm/coupon có sẵn (F6), đổi thu ngân ghi phiên (đệm lại, F8).

---

## F11. Self-order QR (pos_self_order)

Model/trường: `pos.config.self_ordering_mode` (`nothing` Disable / `consultation` QR menu chỉ xem / `mobile` QR menu + Ordering / `kiosk`), `self_ordering_service_mode` (`counter` Pickup zone / `table`), `self_ordering_pay_after` (`meal` / `each`), `self_ordering_takeaway`, `self_ordering_default_user_id` (quyền của user này dùng cho khách ẩn danh), `has_paper` — `pos_self_order/models/pos_config.py:28-92` https://github.com/odoo/odoo/blob/18.0/addons/pos_self_order/models/pos_config.py#L28 ; `restaurant.table.identifier` (mã trong QR); `product.template.self_order_available`.

### Chế độ & ràng buộc
- [TL] `pay_after`: `meal` (trả sau bữa — gọi nhiều lượt vào cùng đơn) / `each` (trả từng lượt gọi). Nhãn `each` ghi "(require Odoo Enterprise)" ở bản community — `pos_config.py:176-181`. ⇒ [SL] trả trước qua QR cần cổng thanh toán online/kiosk terminal của enterprise.
- [TL] Ép `each` khi: kiosk; mobile + counter; mobile mà không có pos_restaurant — `pos_config.py:150-163`. ⇒ "trả sau" CHỈ có khi mobile + theo bàn + nhà hàng.
- [TL] Endpoint chỉ mở khi config có phiên đang mở và mode là `mobile`/`kiosk` (`_verify_pos_config`, access_token) — `pos_self_order/controllers/orders.py:169-179`. Mode `table` mà không tìm thấy bàn theo `identifier` (và không mang đi) ⇒ "Table not found" — `orders.py:181-195`.

### Luồng đơn từ khách
- [TL] Route `/pos-self-order/process-order/<device_type>/` (auth public): tìm đơn theo `uuid`; đơn mới lấy số từ `ir.sequence` riêng `pos.order_<session_id>`, `pos_reference = "Self-Order|Kiosk SSSSS-CCC-NNNN"` (session-config-seq) — `orders.py:12-30, 161-167`.
- [TL] Lọc dữ liệu an toàn `_check_pos_order` rồi gọi CHUNG `sync_from_ui` của POS (sudo) ⇒ cùng luật F1/F2 (đơn draft của bàn bị gộp với đơn đang mở của bàn đó) — `orders.py:31-34`.
- [TL] **Server tính lại toàn bộ giá** (`recompute_prices`) để chống khách sửa giá ở client — `orders.py:35-38`.
- [TL] Tổng = 0 ⇒ set `paid` và xử lý luôn; ngược lại để `draft` (chờ thu ngân/khách trả) — `orders.py:39-45`.
- [TL] Mang đi: fiscal position = `takeaway_fp_id`, tại chỗ = `default_fiscal_position_id` — `pos_self_order/models/pos_order.py:115, 211-212`; trang chọn nơi ăn `eating_location_page.js:24`.
- [TL] Báo cho máy POS: `notify_synchronisation` + `ORDER_STATE_CHANGED` qua bus — `pos_self_order/models/pos_order.py:64-68`. Máy POS tải thêm đơn draft có `pos_reference` chứa "Kiosk"/"Self-Order" hoặc không bàn — `pos_self_order/static/src/overrides/models/pos_store.js:7-22`.
- [TL] Khách hủy đơn (remove) ⇒ `state='cancel'` + báo bus — `pos_order.py:58-62`.
- [TL] Hết món: cờ `self_order_available`, đổi là đẩy `PRODUCT_CHANGED` tới mọi config self-order — `pos_self_order/models/product_product.py:126-140`.
- [SL] Vào bếp: bản community KHÔNG thấy code self-order gọi `printChanges`/`sendOrderInPreparation` (grep trong `pos_self_order/static/src/app`: chỉ có in receipt ở `confirmation_page.js:31-57`). ⇒ đơn QR ra bếp khi nhân viên mở đơn trên POS và bấm gửi bếp (ảnh chụp bếp rỗng ⇒ toàn bộ là "New", F3), hoặc qua màn hình bếp enterprise. Chưa xác nhận bằng chạy thử.

---

## Khoảng trống — thứ không tìm được nguồn

- `pos_preparation_display` (màn hình bếp KDS, trạng thái món đang làm/xong, course thật) là enterprise — không có code. Mọi luật về KDS ở trên chỉ là phần POS community nhìn thấy (`<-pos_preparation_display.display.pos_config_ids`, `pos_store.js:1757`).
- Addon `loyalty` gốc không có trong checkout; đã đọc 5 file models tải raw (không đọc wizard/views/`_get_reward_values` phía sale). Luật làm tròn điểm phía `sale_loyalty` (round down) chỉ biết qua comment trong pos_loyalty.
- Addon `mrp`, `stock`, `account` (nổ kit thực tế, quant âm, `account.cash.rounding`, `price_include`) không có — các ý về chúng gắn [SL].
- Module tài chính theo nước (override `disallowLineQuantityChange`, `doNotAllowRefundAndSales`, vd Bỉ/Đức) không có — không biết chính xác điều kiện bật.
- Hoàn điểm khi refund: chỉ suy từ code (`minimum_qty` chặn qty âm), chưa chạy test.
- Hết hạn điểm theo thời gian (expire sau N tháng): không thấy luật trong POS/loyalty models đã đọc.
- Phân quyền hủy món/hủy đơn/hoàn tiền theo vai trò: grep không thấy ⇒ Odoo 18 community KHÔNG có (không phải "không tìm được").
- Không đọc `pos_sale_loyalty`, `pos_restaurant_appointment`, báo cáo (`report_sale_details`), tip (`set_tip_after_payment`).
- Hệ VN (KiotViet/Sapo/CukCuk/iPOS/POS365): ngoài phạm vi mục này.

## Khác biệt giữa các loại quán (từ góc nhìn Odoo 18)

- Odoo chỉ phân 2 "loại": có `module_pos_restaurant` hay không; onboarding có kịch bản `bar` và `restaurant` — `pos_restaurant/models/pos_config.py:73-107`. Khác biệt thật nằm ở cờ:
  - Quán ăn/nhà hàng: bàn + sơ đồ tầng, 1 đơn draft/bàn (F2), gửi bếp theo diff (F3), chia bill/ghép bàn, `pay_after='meal'` cho QR (F11). Đóng ca bị chặn khi còn bàn mở (F5) — đau nhất với quán mở khuya.
  - Cafe/trà sữa (quầy): không bàn, `tracking_number` 3 số làm số gọi món (F1), self-order `counter` ⇒ ép trả trước `each` (F11), takeaway đổi fiscal position (F7). Topping = attribute `price_extra` không trừ kho (F9) ⇒ trà sữa cần BOM theo biến thể, Odoo POS làm yếu.
  - Bar: happy hour bằng pricelist có `date_start/date_end` theo datetime nhưng cache chỉ dựng lại khi load/đổi dữ liệu (F7) ⇒ không tự bật giữa ca; tab mở lâu = đơn draft trên bàn/đơn nổi.
  - Bakery: bán theo cân (đơn vị không groupable — chia bill chuyển trọn, F2), hàng làm sẵn tồn thật (`consu`, F9), hết hàng không chặn bán (tồn âm, F9).
- [SL] Kết luận: "loại quán" ở Odoo = tổ hợp cờ config, không phải mã nguồn khác — khớp hướng "dữ liệu mẫu + công tắc tính năng" của mô hình dự kiến.

## Tác động lên mô hình

Đối chiếu mô hình dự kiến; đề xuất cụ thể (ưu tiên giảm dần):

1. **Đơn bất biến sau khi trả** — đúng như Odoo (F1). Thêm `order.status` ∈ {draft, paid, posted(=done, khóa sổ khi đóng ca), invoiced, cancelled}; mọi sửa sau `paid` = phiếu hoàn (đơn mới, dòng âm, `refunded_line_id`). Cấm sửa payment sau khi đã in bill (`printed_count > 0`).
2. **Định danh đơn 3 lớp**: `uuid` (client, khóa offline), `device_order_no` = `<session>-<device_login_no>-<seq theo máy>` (không cần mạng), `official_no` (server cấp lúc paid, liên tục, dùng cho hóa đơn). Thêm `call_number` (số gọi món) — Odoo cho trùng giữa các máy (F1), nên làm per-ca-per-chi nhánh do server cấp khi online, fallback có tiền tố máy.
3. **Chia bill = đơn mới + FK** `split_from_order_id` LƯU DB (Odoo chỉ để trong uiState, mất khi reload — F2). Thanh toán từng phần = nhiều `payment` trên 1 đơn — đã có.
4. **Trạng thái bếp theo dòng, không theo ảnh chụp JSON**: thay `last_order_preparation_change` bằng bảng `kitchen_ticket` + `kitchen_ticket_line(order_line_id, qty_delta, kind: new|cancel|note|mode_change, printer/station_id, printed_at, status)`. Lý do: Odoo cập nhật ảnh chụp kể cả khi in lỗi (F3) ⇒ mất phiếu. Thêm `order_line.hold` (=`skip_change`) và `course_no` (Odoo 18 không có course).
5. **Hủy món = sự kiện**: `line_void(order_line_id, qty, reason_id, requested_by, approved_by, after_sent: bool)`; giảm dưới `sent_qty` ⇒ tạo dòng âm (đúng mô hình Odoo khi bật cờ tài chính, F3) chứ không sửa dòng. Cờ cấu hình `require_approval_void_after_sent`.
6. **Nhân viên trên DÒNG**: `order_line.created_by_employee_id`, `payment.received_by_employee_id`, `void.approved_by` — Odoo chỉ có ở đơn và bị ghi đè bởi người chạm cuối (F8).
7. **Quyền chi tiết** thay 2 mức manager/cashier: permission keys `refund`, `void_after_sent`, `line_discount`, `order_discount`, `price_override`, `cash_move`, `accept_close_diff`, `reopen_paid_order`; kèm ngưỡng (vd giảm giá > X% cần duyệt). Không băm PIN SHA1 không salt gửi xuống client (F8) — dùng PIN + giới hạn thử + token thiết bị.
8. **Khuyến mãi & tích điểm** (F6) — tách hai khái niệm ở tầng sản phẩm nhưng có thể chung engine:
   - `promotion(program_type, trigger: auto|code, date_from/to (datetime + khung giờ/ngày trong tuần — Odoo thiếu), pricelist/branch scope, max_usage, stackable: bool, priority)` + `promotion_rule(min_qty, min_amount, amount_tax_mode incl|excl, product/category/tag scope)` + `promotion_reward(type: discount|free_item, discount_mode percent|fixed|per_point, applicability order|cheapest|specific, max_amount)`.
   - Odoo cộng dồn MỌI reward auto, chỉ global discount lấy cái lớn nhất, kết quả phụ thuộc thứ tự ⇒ mô hình cần `stackable` + `priority` tường minh.
   - Dòng giảm giá: một dòng âm PER THUẾ SUẤT (Odoo làm vậy) để thuế đúng; snapshot `promotion_id` trên dòng.
   - Điểm: `loyalty_ledger(card_id, order_id, issued, used, expires_at)` là nguồn thật, số dư = Σ (Odoo có `loyalty.history` nhưng số dư vẫn là trường cộng dồn). Cấu hình `points_base: after_discount_incl_tax` (mặc định Odoo) | `before_discount` | `excl_tax`; `points_rounding: half_up_0.01` (Odoo POS) | `floor_int`. Refund phải sinh bút toán điểm âm tường minh (Odoo mặc định KHÔNG trừ — [SL]).
   - Gift card/eWallet = **phương thức thanh toán** (sổ tiền), không phải giảm giá: không chịu thuế lại, cấm hoàn dòng nạp; hạn mặc định 1 năm.
9. **Giá**: `price_list_item(scope: variant|product|category|global, min_qty, datetime range, day_of_week, time_window)` + ưu tiên variant > product > category > global (Odoo). Đánh giá lại theo thời điểm thêm dòng (không cache cả ca). Snapshot `price_source` trên dòng (`original|manual|promo`) như `price_type`.
10. **Thuế theo kiểu phục vụ**: `service_type` (dine_in/takeaway/delivery) map tới `tax_profile` (= fiscal position). Đổi kiểu phục vụ sau khi gửi bếp ⇒ sinh phiếu bếp `mode_change`.
11. **Ca/két**: 1 phiên mở / quầy (Odoo) nhưng cho nhiều máy. Thêm `business_date` (Odoo không có — `date_order` + phiên) và cho phép **chuyển đơn mở sang ca sau** (Odoo chặn đóng ca khi còn draft). `cash_move(type in/out, amount, reason, employee_id)`. Chênh lệch: ngưỡng per PTTT + người duyệt.
12. **Kho**: thời điểm trừ kho = cấu hình (real/closing — Odoo để ở cấp công ty, snapshot vào ca: nên làm per chi nhánh và snapshot tương tự). Picking lỗi không chặn bán ⇒ cần hàng đợi "phiếu kho lỗi" (= `failed_pickings`). Refund mặc định nhập lại kho ⇒ thêm cờ `restock: bool` trên dòng hoàn (F&B món đã chế biến thì không). Topping/option phải có `ingredient_delta` (Odoo attribute không trừ kho — đúng chỗ mô hình dự kiến đã có "delta định lượng"). Tồn âm cho phép + `auto_86` (hết món) liên kết tồn — Odoo chỉ có cờ tay `self_order_available`.
13. **Đồng bộ**: server là nguồn thật, bus chỉ báo "có đổi" (Odoo). Thêm `order.version` (optimistic lock) thay `write_date` 1 giây; xung đột trên cùng bàn phải báo ngay khi lưu, không chỉ khi gửi bếp.
14. **Self-order**: chế độ `menu_only | order_pay_later(table) | order_pay_first(counter/kiosk)`; server tính lại giá; đơn QR vào hàng chờ "chờ xác nhận" trước khi in bếp (cờ `auto_send_to_kitchen`).

## Câu hỏi chưa giải quyết
- Refund có thật sự không trừ điểm khi `minimum_qty=1`? Cần chạy test tour `pos_loyalty` hoặc đọc test để xác nhận.
- Happy hour: cache pricelist có được dựng lại theo timer nào khác ngoài create/update không? (chưa thấy, grep hạn chế ở `point_of_sale/static/src`).
- KDS enterprise xử lý course/"fire" thế nào — cần bản enterprise hoặc tài liệu chính thức.
