# Danh mục logic — hệ thống quản lý quán F&B đa loại hình

> Tổng hợp từ 6 file nghiên cứu trong `research/` (2026-10-19). Đây là **nền cho plan**, chưa phải plan.
> Trạng thái: **bản đề xuất, user chưa duyệt.** Mọi mục [QĐ] là đề xuất của Claude, chưa phải quyết định đã chốt.

Nhãn:
- **[A]…[F]** — có bằng chứng trong file nghiên cứu tương ứng (xem bảng nguồn). Chi tiết + link nằm trong file đó.
- **[QĐ]** — quyết định thiết kế đề xuất, khi các nguồn khác nhau hoặc không nguồn nào có.
- **[MỞ]** — chưa quyết được, cần user / kế toán thuế / quán thật trả lời (gom ở §23).

## 0. Nguồn và độ tin cậy

| File | Phạm vi | Nguồn chính | Model | Độ tin |
|---|---|---|---|---|
| A | menu, đơn, bàn, bếp, thanh toán, hủy, ca, in | Toast, Square, Odoo docs | Haiku | cao với Toast; VN = 0 |
| B | đơn vị, định lượng, bán thành phẩm, nhập, kiểm kê, chuyển kho, giá vốn | Lightspeed K, Toast, Loyverse, Sapo blog, code Odoo | Haiku | trung bình; VN gần như 0 |
| C | chuỗi, khuyến mãi, thành viên, quyền, báo cáo | Toast, Square, Loyverse, Sapo, code Odoo | Haiku | trung bình; nhiều luật "không tìm thấy" |
| D | hóa đơn điện tử, VietQR, giao hàng, offline, in | blog MISA/Sapo, docs SePay, SDK Grab, Toast/Loyverse | Haiku | **pháp lý là nguồn thứ cấp** |
| E | API công khai VN | **CukCuk Open API (chính thức)**, SDK KiotViet/POS365 bên thứ ba | Haiku | cao với CukCuk, thấp với phần còn lại |
| F | luật chính xác từ code | **mã nguồn Odoo 18 community** | Opus | cao (đọc code, có file:dòng) |

Chưa có: bất kỳ flow thao tác nào của KiotViet / Sapo FnB / iPOS / CukCuk / POS365 (xem §24).

## 1. Sửa lại những gì Claude đã nói trước đó trong cuộc trò chuyện

| Đã nói | Sửa lại | Nguồn |
|---|---|---|
| Hóa đơn điện tử theo NĐ 70/2025 | NĐ 254/2026 + TT 91/2026, hiệu lực khoảng 01/07/2026 | [D] — nguồn thứ cấp, chưa đối chiếu công báo |
| Hộ kinh doanh ≥ 1 tỷ/năm mới bắt buộc | Kinh doanh **ăn uống bán trực tiếp người tiêu dùng** bắt buộc dùng hóa đơn từ máy tính tiền **bất kể doanh thu** | [D] — nguồn thứ cấp |
| Tồn kho = cộng trừ sổ phiếu | Sổ phiếu + **mốc kiểm kê ghi đè** + phiếu tồn đầu | [B] |
| Nhiều lần thanh toán trên một đơn là đủ để chia bill | Cần cả **đơn con** khi chia bill | [A][F] |

## 2. Nguyên tắc xuyên suốt (invariants)

1. **Chứng từ đã chốt là bất biến.** Đơn đã thanh toán, phiếu kho đã duyệt, hóa đơn đã phát hành: không sửa, chỉ tạo chứng từ đảo có liên kết (đơn hoàn dòng âm, phiếu điều chỉnh, hóa đơn điều chỉnh). [F] Odoo ép mọi đơn khác draft bất biến; [A] Toast void/refund; [D] hóa đơn từ máy tính tiền không hủy sau khi lập.
2. **Mọi thao tác ghi người làm, và người duyệt nếu cần duyệt.** Trên dòng đơn, thanh toán, hủy, phiếu kho, không chỉ trên đơn. [F] Odoo chỉ ghi ở cấp đơn và bị ghi đè bởi người chạm cuối, nên mất dấu; [C] Square dùng mã chung nên mất dấu.
3. **Lưu lại giá trị tại thời điểm bán (snapshot):** tên, mã, loại hàng, giá gốc, giảm giá phân bổ, thuế suất, tiền thuế, phiên bản định lượng. [E] CukCuk `AllocationAmount`, `TaxRate` trên dòng; [B] cần phiên bản định lượng.
4. **Ngày kinh doanh ≠ giờ thật.** `business_date` trên đơn, ca, phiếu kho; giờ cắt cấu hình theo chi nhánh. [C] Toast cắt 4h sáng; [F] Odoo không có, đó là chỗ yếu.
5. **Số dư = sổ cái.** Kho, điểm, thẻ trả trước/ví, két tiền đều là sổ bút toán; số dư = tổng bút toán kể từ mốc kiểm kê gần nhất. Không lưu một con số rồi cộng trừ. [B][F]
6. **Cấu hình kế thừa có fallback:** hệ thống → thương hiệu → chi nhánh → thiết bị. [C] Toast group → location; Square ghi đè theo biến thể.
7. **Công tắc tính năng có ràng buộc:** phụ thuộc (bật A cần B) và loại trừ (A và B không cùng bật). [A] Toast course pacing loại trừ server firing.
8. **Quầy chạy được khi mất mạng:** máy tự đánh số, có hàng đợi; server là nguồn thật, kênh realtime chỉ là chuông báo. [D][F]

## 3. Tổ chức & cấu hình

- Cấp: `organization` (pháp nhân, MST) → `brand` → `branch` (cửa hàng) → `area`/`table` → `device`. [C]
- Mỗi chi nhánh có ≥ 1 kho; cờ kho chính. [E] CukCuk `IsBaseDepot`.
- Cấu hình nằm ở cấp thấp nhất có giá trị; thiếu thì lấy cấp trên. [C]
- [QĐ] Nhượng quyền: v1 chỉ cần mỗi thương hiệu có nhiều chi nhánh, báo cáo hợp nhất theo thương hiệu. Phân quyền dữ liệu riêng cho chủ nhượng quyền để sau. [C] không tìm thấy mô hình nào.

## 4. Menu & giá

**Cấu trúc** [A][E][F]
- `category` → `product` → `variant` (size…) → `modifier_group` → `modifier_option`.
- Nhóm tùy chọn có: `min`, `max`, `required`; **điều kiện theo biến thể** (size L cho thêm nhiều topping hơn); cho **chọn trùng** một tùy chọn; **max theo từng tùy chọn** tách khỏi max của nhóm. [A] Toast/Speedline/Oolio.
- [QĐ] **Giữ nhóm tùy chọn min/max**, không theo đề xuất bỏ của file E: API VN chỉ lộ hóa đơn, không lộ cấu hình menu; trà sữa cần "chọn đúng 1 mức đường".
- Tùy chọn có `price_delta` và `ingredient_delta` (thay đổi định lượng). [F] Odoo không có ⇒ topping không trừ kho, đúng chỗ yếu.
- Loại hàng (`product_kind`): món chế biến, đồ uống pha chế, hàng bán thẳng (chai nước), combo, nguyên liệu, bán thành phẩm, dịch vụ. [E] CukCuk `InventoryItemType` 1–10.
- Combo: danh sách thành phần, mỗi thành phần chọn trong một nhóm; đổi món có phụ thu. [A] luật phụ thu: không tìm thấy ⇒ [QĐ] mỗi lựa chọn trong combo có `upcharge`.
- Cờ trên món: `track_stock`, `earns_points` [E] KiotViet `isRewardPoint`, `sold_by_weight`, `open_price`, `kitchen_station`, `print_cup_label`.

**Kiểu giá** [A][F]
- base, theo biến thể, **giá nhập tay lúc order** (cần quyền; duyệt gắn đúng đơn + món + giá, D-105), **theo cân** (đơn giá mỗi kg hoặc mỗi 100 g × cân nặng nhập bằng gam, làm tròn half-up tới đồng, D-106), theo kênh, theo khung giờ.
- Bảng giá: `price_list_item(scope: variant|product|category|global, branch?, channel?, min_qty, datetime range, day_of_week, time_window)`. Ưu tiên: variant > product > category > global. [F]
  **R1 làm khác:** chưa có `min_qty` và nhóm khách; bảng giá được xóa hẳn (không lưu trữ) vì không có gì trỏ tới; kênh là chữ tự do, máy quầy bán không kênh nên quy tắc có kênh chưa áp ở quầy (D-117).
- [QĐ] Tính giá **tại lúc thêm dòng**, không dựng sẵn cho cả ca. [F] Odoo dựng sẵn nên happy hour không tự bật giữa ca.
- Giá theo chi nhánh = ghi đè trên biến thể, thiếu thì lấy giá chung. [C] Square/Toast.

**Hết món** [A][B][F]
- Hai cờ tách nhau: `manual_86` (bật tay, theo chi nhánh, theo kênh) và `auto_86_when_stock_zero` (theo tồn). [A] Square 86 là cờ hiển thị, không phải tồn.
- Hết món phải đồng bộ sang app giao hàng (§19).

**Ngoài v1:** menu ẩn/hiện theo khung giờ (dayparts). [A] không tìm thấy ở hệ nào đã đọc. [QĐ] Để v2.

## 5. Đơn & kênh bán

**Kiểu phục vụ** = hành vi, không phải nhãn. [A][E][F]
- Giá trị: `dine_in`, `takeaway`, `delivery_self`, `delivery_platform:<kênh>`, `reservation` [E] CukCuk có đặt chỗ. Drive-thru/curbside không cần cho VN.
- Mỗi kiểu quyết định: có bàn không, trả trước hay sau, có course không, thuế và phí dịch vụ áp gì (§8), in tem hay không.
- Đổi kiểu phục vụ sau khi đã gửi bếp ⇒ sinh phiếu bếp loại `mode_change`. [F]

**Trạng thái đơn** [F][E]
- `draft` (đang mở) → `paid` → `posted` (đã khóa sổ khi đóng ca) ; `cancelled` (hủy trước khi trả).
- [QĐ] Không có trạng thái "invoiced" trên đơn: hóa đơn điện tử là thực thể riêng với trạng thái riêng (§18). [E] CukCuk tách `StatusReleaseEInvoice` khỏi `PaymentStatus`.
- [QĐ] Thêm `on_credit` (ghi nợ) cho khách quen/công ty. [E] CukCuk `PaymentStatus` 2. [MỞ] có cần ở v1 không.
- Dòng đơn có trạng thái riêng theo trạm bếp (§7).

**Dòng đơn là cây** [E][F]
- `order_line(parent_line_id, line_type: item|modifier|combo_component|discount, …snapshot)`. [E] CukCuk: món thêm là dòng con với `ParentID`.
- Lý do: mỗi topping có giá, thuế, định lượng, phiếu bếp riêng; báo cáo bán topping được.

**Định danh đơn 3 lớp** [F]
- `uuid` do máy tạo (khóa khi offline);
- `device_order_no` = chi nhánh-máy-số thứ tự theo máy (không cần mạng);
- `official_no` do server cấp lúc thanh toán, liên tục, dùng cho hóa đơn.
- `call_number` (số gọi món cho quầy trà sữa/cafe): server cấp theo ca theo chi nhánh; khi offline thì thêm tiền tố máy. [F] Odoo để trùng giữa các máy. **R1 làm khác (D-048):** số gọi tính trên máy, `((số đơn của máy − 1) mod 100) + 1`, không theo ca, không tiền tố; chi nhánh nhiều máy chờ D-082.

**Đơn từ QR tại bàn / kiosk** [F][A]
- Chế độ: `menu_only` | `order_pay_later` (theo bàn) | `order_pay_first` (quầy/kiosk).
- Server **tính lại giá**, không tin giá client gửi lên. [F]
- [QĐ] Đơn QR vào hàng "chờ xác nhận" trước khi gửi bếp; cờ `auto_send_to_kitchen`.

## 6. Bàn

- Sơ đồ khu vực, bàn có số ghế. [A][F]
- **Tối đa 1 đơn đang mở trên 1 bàn** (server ép). [F] Hai máy cùng mở một bàn ⇒ đè dữ liệu ⇒ cần khóa phiên bản (§20).
- Chuyển sang bàn trống: đơn đi theo. Chuyển sang bàn đang có khách = **gộp đơn**; trạng thái đã gửi bếp đi theo từng dòng nên không in lại. [F] **R1 làm khác (D-056):** chỉ chuyển sang bàn trống; bàn có khách bị từ chối ("Máy chưa gộp được hai bàn"), gộp bàn để R2 (FT-102).
- Ghép bàn vật lý (bàn đoàn): bàn con trỏ về bàn cha. [F] `parent_id`.
- Tách món sang bàn khác = chia bill (§8).
- [QĐ] Bàn là khóa ngoại + lưu tên bàn lúc bán. [E] CukCuk chỉ lưu chuỗi tên bàn, báo cáo theo bàn sẽ kém.
- Đặt bàn trước: v1 chỉ cần giữ bàn theo giờ + ghi chú. [A] chỉ có Odoo ở mức bật tính năng.

## 7. Bếp / pha chế

- Định tuyến theo **trạm** (`station`): bar pha chế, bếp nóng, bếp lạnh…; món → trạm theo nhóm món, ghi đè được theo món. [A][F]
- Mỗi lần "gửi bếp" = so đơn hiện tại với những gì đã gửi ⇒ phiếu gồm dòng **mới / sửa ghi chú / hủy**. [F]
- [QĐ] Lưu bảng `kitchen_ticket` + `kitchen_ticket_line(order_line_id, qty_delta, kind: new|cancel|note|mode_change, station_id, status, printed_at)`, **không** lưu ảnh chụp JSON. [F] Odoo cập nhật ảnh chụp cả khi in lỗi ⇒ bếp mất phiếu.
- **Giữ món, gọi sau** (`hold`) và **course** (`course_no`, chỉ với `dine_in`). [A] Toast có, [F] Odoo 18 community không có.
- Trạng thái món ở trạm (khi có màn hình bếp): `queued → preparing → ready → served`. [A] không đọc được nguồn đầy đủ ⇒ [QĐ] dùng 4 trạng thái này.
- Hủy món đã gửi bếp ⇒ in phiếu HỦY ở trạm đó (§9).

## 8. Thanh toán

**Cấu trúc** [A][D][E][F]
- `payment_intent` (yêu cầu thu, vd QR động: số tiền, mã nội dung, trạng thái `pending|paid|partial|overpaid|expired`) tách khỏi `payment` (tiền đã thu thật) và `bank_transaction` (webhook thô từ SePay/PayOS/Casso, **unique(gateway, reference_code)** để không ghi trùng). [D]
- Một đơn có nhiều `payment` (nhiều phương thức, trả nhiều lần). [E] CukCuk `InvoicePayment` 1-n. **R1 làm khác (D-073, D-080):** máy quầy chọn MỘT cách trả mỗi đơn (tiền mặt hoặc QR); ngoại lệ duy nhất là thu nốt phần QR chuyển thiếu bằng tiền mặt hoặc QR thứ hai. Bảng `payment` vẫn 1-n.
- Phương thức: tiền mặt, QR chuyển khoản, thẻ (máy POS ngân hàng rời), ví (MoMo/ZaloPay/VNPay), thẻ trả trước/ví nội bộ, voucher, ghi nợ. [E] CukCuk `PaymentType` 1–7.
- **Gift card / ví nội bộ là phương thức thanh toán**, không phải giảm giá: không tính thuế lại, không hoàn dòng nạp tiền. [F]

**Chia bill** [A][F]
- Theo món / theo ghế / chia đều ⇒ tạo **đơn mới** với `split_from_order_id` **lưu DB**. [F] Odoo chỉ giữ ở bộ nhớ client, tải lại trang là mất.
- Đơn vị theo cân không chia nhỏ được, phải chuyển nguyên dòng. [F]

**Thuế, phí, làm tròn** [E][F]
- VAT và phí dịch vụ **theo kênh** (tại chỗ / mang đi / giao). [E] CukCuk `VATForTakeAway`, `CalcServiceDelivery`; [F] Odoo đổi bộ thuế khi mang đi.
- Cờ thứ tự: phí dịch vụ tính trước hay sau khuyến mãi. [E] `IsCalcServiceAmountNotPromotion`.
- Giá đã gồm thuế vs cộng thuế: cấu hình theo chi nhánh. [QĐ] Mặc định VN: giá niêm yết đã gồm thuế.
- Làm tròn tiền: chỉ áp cho tiền mặt hoặc toàn đơn; phương pháp cấu hình. [F]
- Giảm giá toàn đơn ⇒ tách **một dòng âm cho mỗi thuế suất** để thuế đúng. [F]
- Dòng đơn lưu riêng: gộp, giảm, thuế, thực thu. [C]
- Tip: [QĐ] có cờ, mặc định tắt ở VN.

**Ca khó QR** [D]: khách chuyển thiếu/thừa/sai nội dung, chuyển 2 lần, webhook đến trễ ⇒ có màn **khớp tay** giao dịch với đơn; QR tĩnh khi không có webhook (`payment.qr_static_fallback`).

## 9. Hủy / hoàn

Ba đường khác nhau, không dùng chung một trạng thái: [A][D][F]

| Tình huống | Cách làm | Kho | Quyền |
|---|---|---|---|
| Bớt món **chưa gửi bếp** | sửa dòng trực tiếp | không đụng | thu ngân |
| Hủy món **đã gửi bếp**, đơn chưa trả | sự kiện `line_void(qty, reason_id, requested_by, approved_by, after_sent)`; dòng âm, không xóa dòng | [QĐ] mặc định **không** trả nguyên liệu (đã làm); cờ chọn | cờ `require_approval_void_after_sent` |
| Đơn **đã trả** | **đơn hoàn**: đơn mới, dòng âm, `refunded_line_id`; số lượng còn hoàn được tính cả đơn hoàn chưa trả | cờ `restock` trên dòng hoàn ([QĐ] món chế biến: mặc định không) | [QĐ] cần quyền `refund` (Odoo không khóa ⇒ yếu) |

- Hủy trong **cùng ngày kinh doanh** là void; sang ngày khác bắt buộc là hoàn. [A] Toast.
- Lý do hủy là danh mục có sẵn + ghi chú. [E] POS365 `PosReturnReason`.
- Đơn có hóa đơn điện tử rồi ⇒ hoàn = sự kiện đảo + [MỞ] có phát hóa đơn điều chỉnh không (§18).
- Khuyến mãi và điểm khi hoàn: §14, §15.

## 10. Ca & két tiền

- Trạng thái ca: `opening` (đếm tiền đầu) → `open` → `closing` (đếm cuối) → `closed`. [F] **R1 làm khác:** ca chỉ có `open` và `closed`; tiền đếm đầu/cuối ca nằm trong lệnh mở/đóng.
- Một ca cho một quầy, nhiều máy dùng chung được. [F] **R1 làm khác (D-041):** một ca chưa đóng cho MỖI máy; máy chủ từ chối ca thứ hai của cùng máy.
- Thu/chi ngoài bán hàng (`cash_move`: loại, số tiền, lý do, người làm). [F][E] POS365 `PosPayoutTypes`.
- Tiền dự kiến = đầu ca + tiền mặt bán − tiền mặt hoàn ± thu/chi. Đếm theo mệnh giá. [A] Toast Expected Deposit; [E] POS365 `Denominations`.
- Chênh lệch: **một** ngưỡng cho tiền mặt (`shift_close_difference_tolerance`, mặc định 0 đ, chỉnh ở trang Cài đặt); vượt ngưỡng cần người duyệt, trong ngưỡng vẫn ghi lại chênh lệch. Không có ngưỡng theo phương thức: két chỉ có tiền mặt, QR khớp bằng ngân hàng (D-078). [F]
- [QĐ] **Cho đóng ca khi còn bàn mở bằng cách chuyển đơn mở sang ca sau.** [F] Odoo chặn đóng ca, rất phiền với quán mở khuya.
- Đơn offline đến sau khi ca đã đóng ⇒ gắn đúng ca và ngày kinh doanh lúc **bán**, không phải lúc nhận. [F] Odoo gắn sang ca đang mở ⇒ sai.
- Đối soát cuối ca theo từng phương thức: tiền mặt đếm, QR khớp ngân hàng, thẻ khớp máy POS, kênh giao hàng trừ phí. [D]

## 11. In ấn & thiết bị

- Loại phiếu: bill tạm tính, bill thanh toán, phiếu bếp theo trạm, **tem dán ly** (một tem một ly, có in topping), phiếu hủy, phiếu chốt ca. [A]
- `print_job(station, kind, status, retries)` ghi **trước** khi gửi; in lại được; in lỗi thì báo lỗi, không im lặng. [D][F]
- Trình duyệt không in thẳng ổn định ra máy in nhiệt LAN: trang HTTPS không gọi được HTTP trong LAN (mixed content), WebUSB/Bluetooth cần người bấm và chỉ chạy trên Chromium. ⇒ **bắt buộc có cầu nối cục bộ** (app trên máy quầy hoặc box nhỏ) cho in bếp, mở két, in khi mất mạng. [D]
- Két tiền mở qua máy in (ESC/POS). [D]
- Ngoài v1: màn hình phụ cho khách, thẻ rung, máy cân tích hợp. [D] không đủ nguồn.

## 12. Kho & định lượng

**Đơn vị** [B]: đơn vị gốc + quy đổi nhiều cấp (thùng → hộp → ml); đơn vị nhập ≠ đơn vị dùng; bar: kiểm kê theo chai, trừ theo ml.

**Định lượng (công thức)** [B][F]
- Theo biến thể (size) + `ingredient_delta` theo tùy chọn (mức đường = hệ số).
- **Có phiên bản**; dòng đơn lưu phiên bản đã dùng. [B]
- [QĐ] Hao hụt cho phép: không có trong công thức; ghi qua phiếu hủy và báo cáo chênh lệch. [B] không hệ nào có trường này.
- [QĐ] Nguyên liệu là danh mục riêng, không phải món trên menu (giống Sapo/Toast). Hàng bán thẳng là món có `track_stock` trừ chính nó.

**Thời điểm trừ kho** = cấu hình theo chi nhánh, chốt vào ca lúc mở ca: `on_send_to_kitchen | on_payment | on_shift_close`. [B][F]
- [QĐ] Mặc định `on_payment`.
- Món làm theo mẻ trừ nguyên liệu lúc **xong mẻ**, không phải lúc bán. [B] Lightspeed.

**Bán thành phẩm** (trân châu, cốt trà, sốt): là mặt hàng **có tồn riêng**; `production_order` (mẻ) trừ nguyên liệu + cộng tồn theo sản lượng; lồng nhiều tầng được. [B]

**Phiếu kho** [B]
- Loại: tồn đầu, nhập (theo đơn đặt hàng, nhận một phần), trả nhà cung cấp, xuất theo bán, hủy (lý do: hỏng / hết hạn / đổ vỡ), sản xuất, chuyển kho (trạng thái `in_transit`, nhận thiếu/dư), **kiểm kê = mốc ghi đè**.
- Phiếu lỗi không chặn bán ⇒ vào hàng đợi "phiếu kho lỗi" để xử lý tay. [F]

**Tồn âm** [B][F]: cờ `allow_negative_stock` (theo chi nhánh, ghi đè theo món). [QĐ] Mặc định **cho phép** (quán không thể ngừng bán vì nhập liệu kho trễ) + cảnh báo.

**Cảnh báo**: tồn tối thiểu, đề xuất đặt hàng; lô + hạn dùng cho tiệm bánh. [B] FEFO: không hệ nào có ⇒ [QĐ] để v2.

## 13. Giá vốn

- [QĐ] Mặc định **bình quân gia quyền di động** (giống Sapo), có công thức cho trả hàng nhà cung cấp; FIFO để v2. [B]
- Bán khi tồn âm ⇒ lấy giá nhập gần nhất, tính lại khi nhập. [B]
- Giá vốn món = Σ (định lượng × giá vốn nguyên liệu) theo phiên bản công thức lúc bán ⇒ báo cáo lãi gộp theo món. [B]

## 14. Khuyến mãi

**Cấu trúc** [C][F]
- `promotion(type, trigger: auto|code|manual, lịch: khoảng ngày + ngày trong tuần + khung giờ, phạm vi: thương hiệu/chi nhánh/kênh/hạng thành viên, max_usage tổng + theo khách, stackable, priority)`.
- `promotion_rule(min_qty, min_amount, tính trên tiền gồm/không gồm thuế, phạm vi món/nhóm/tag)`.
- `promotion_reward(giảm %/tiền, áp lên: cả đơn / món rẻ nhất / món cụ thể, tặng món, giá combo, giảm tối đa)`.
- Voucher: mã dùng một lần hoặc nhiều lần; phạm vi theo nhóm hàng. [E] CukCuk `ApplyVoucherType`.
- "Món mời" (miễn phí do quản lý duyệt) là loại riêng, cần quyền. [E] CukCuk `PromotionType` 2.

**Cộng dồn** [F][C]
- Odoo: mọi khuyến mãi tự động đều cộng dồn, riêng giảm toàn đơn lấy mức cao nhất, kết quả phụ thuộc thứ tự. Lightspeed: "giảm nhiều nhất thắng".
- [QĐ] Mặc định **không cộng dồn**: chọn khuyến mãi có lợi nhất cho khách trong nhóm không cộng dồn; khuyến mãi gắn `stackable=true` mới cộng thêm; thứ tự theo `priority`.

**Phân bổ & hoàn** [E][F]
- Giảm toàn đơn **phân bổ xuống từng dòng** theo tỉ lệ. [E] CukCuk `AllocationAmount`.
- [QĐ] Hoàn một phần ⇒ trả lại tiền thực thu của dòng (sau phân bổ). Không đòi lại khuyến mãi nếu phần còn lại không còn đủ điều kiện. [MỞ] cần chủ quán xác nhận (§23).

## 15. Thành viên, tích điểm, thẻ trả trước

- **Tách khuyến mãi khỏi tích điểm**, và **tách sổ điểm khỏi sổ tiền**. [C][F] Odoo gộp chung và lưu số dư ví vào trường điểm.
- `loyalty_ledger(customer, order, points ±, reason, expires_at)`; số dư = tổng. [F]
- Cách tính điểm (cấu hình): cơ sở mặc định Odoo = **tiền sau giảm, gồm thuế**; làm tròn: Odoo POS nửa lên tới 0,01. [F]
  [QĐ] Mặc định VN: trên tiền khách thực trả, **làm tròn xuống số nguyên**.
- Món không tích điểm: cờ `earns_points`. [E]
- Hoàn đơn ⇒ **bút toán điểm âm tường minh** theo tỉ lệ dòng hoàn. [F] Odoo mặc định không trừ.
- Đổi điểm = một loại reward của khuyến mãi (giảm tiền theo điểm), ghi bút toán điểm âm.
- Hạng thành viên: [MỞ] lên/xuống theo chi tiêu kỳ hay trọn đời. [C] không tìm thấy luật nào.
- Thẻ trả trước / ví: `wallet_ledger` riêng (nạp, trừ, hoàn); dùng như phương thức thanh toán (§8); [F] hạn mặc định 1 năm ⇒ [MỞ].
- Gắn khách vào đơn bằng SĐT. [C]

## 16. Nhân viên & quyền

- Đăng nhập nhanh bằng PIN trên máy quầy; **không dùng mã chung**. [C][F]
- [QĐ] PIN không gửi bản băm xuống máy. [F] Odoo gửi SHA1 không salt. Dùng token thiết bị + giới hạn số lần thử.
- Quyền là **danh sách khóa quyền**, không chỉ 2 mức quản lý/thu ngân [F]: `refund`, `void_after_sent`, `line_discount`, `order_discount` (+ ngưỡng %), `price_override`, `open_price`, `comp_item`, `cash_move`, `open_drawer`, `accept_close_diff`, `reopen_paid_order`, `view_reports`, `edit_menu`, `stock_adjust`…
- **Duyệt tại chỗ:** thiếu quyền ⇒ người có quyền nhập PIN để cho phép **một lần**; ghi `approval_log(action, requested_by, approved_by, at, payload)`. [C] Loyverse.
- Vai trò mặc định (chủ, quản lý, thu ngân, phục vụ, pha chế/bếp, thủ kho) = bộ quyền mẫu, sửa được.
- Nhật ký thao tác cho mọi hành động nhạy cảm. [C]
- Chấm công: v1 chỉ cần giờ vào/ra theo ca. Lương và hoa hồng để sau. [C]

## 17. Báo cáo

- Định nghĩa doanh thu cố định trong code, ghi rõ trên báo cáo: **gộp** (trước giảm) → **giảm giá** → **thuần** (sau giảm, trước/sau VAT tách cột) → **hoàn/hủy** tách riêng. [C]
- Báo cáo chuẩn: theo giờ, ngày kinh doanh, món (có topping), nhóm món, nhân viên, kênh, phương thức thanh toán; hủy món; giảm giá/món mời; chốt ca; lãi gộp theo món; tồn và chênh lệch kiểm kê. [C][B]
- Tất cả theo `business_date`. [C]
- Chốt cuối ngày: không còn ca mở, hóa đơn đã gửi, sinh báo cáo cuối ngày. [C] Toast Close Out Day; [D] gửi dữ liệu hóa đơn cuối ngày.

## 18. Hóa đơn điện tử (máy tính tiền)

> Toàn bộ mục này dựa trên **nguồn thứ cấp** (blog MISA/Sapo). Phải đối chiếu văn bản gốc NĐ 254/2026 + TT 91/2026 với kế toán thuế trước khi code. [D]

- Đối tượng: kinh doanh ăn uống bán trực tiếp ⇒ bắt buộc, bất kể doanh thu. ⇒ Cờ `einvoice_profile` theo chi nhánh, không suy từ doanh thu.
- Lập **mỗi lần bán**, không gom cuối ngày; **gửi dữ liệu lên cơ quan thuế cuối ngày**; gửi chậm bị phạt 2–20 triệu.
- Nội dung bắt buộc: người bán (tên, địa chỉ, MST); hàng (tên, số lượng, đơn giá, tổng); thời điểm lập; mã của cơ quan thuế; ký hiệu mẫu có chữ M. Thông tin người mua chỉ khi khách yêu cầu (tên/MST/CCCD/SĐT).
- Không bắt buộc chữ ký số với hóa đơn in từ máy tính tiền.
- Hóa đơn từ máy tính tiền **không điều chỉnh/hủy sau khi lập**; sai sót ghi sổ và báo cáo kỳ kê khai. [MỞ] mâu thuẫn với "trả hàng phải lập hóa đơn điều chỉnh".
- Thực thể: `einvoice(order_id, mẫu, số, mã CQT, status)` + `einvoice_submission_batch` (cuối ngày). Trạng thái tách riêng khỏi thanh toán, tham chiếu CukCuk: phát hành `-2…5`, gửi CQT `0…4`. [E]
- Tích hợp qua nhà cung cấp hóa đơn (VNPT, Viettel, MISA, BKAV, EasyInvoice…). API từng hãng **chưa đọc**. [D]
- Mất mạng ⇒ hàng đợi hóa đơn; không được mất bill. [D]
- `regime_version` theo ngày áp dụng, không viết cứng ngày chuyển đổi. [D]

## 19. Kênh giao hàng

- **GrabFood:** có API đối tác chính thức (menu, bật/tắt món, nhận đơn, chuẩn bị/hủy/hoàn, tạm đóng cửa hàng); phải là đối tác được cấp. [D]
- **ShopeeFood:** không có API công khai, chỉ qua đối tác tích hợp (Sapo có). Be: không có thông tin. [D]
- Thực thể: `sales_channel`, `channel_order(external_id unique theo kênh, trạng thái kênh, phí/hoa hồng)`, `channel_menu(giá, bật/tắt theo kênh)`. [D]
- Nhận đơn kênh phải đi qua **cloud** (webhook), không phụ thuộc máy quầy đang mở. [D]
- [QĐ] v1: nhập tay đơn app giao hàng như một kênh (`delivery_platform:grab`) với giá theo kênh. Tích hợp API ở giai đoạn sau, khi có tư cách đối tác.

## 20. Offline & đồng bộ

- Khi mất mạng, quầy **vẫn bán**: tạo đơn, tiền mặt, in bếp qua cầu nối cục bộ, hàng đợi đơn/hóa đơn. [D]
- Khi mất mạng, **khóa**: sửa menu/giá/hết món, tích điểm, khuyến mãi theo mã dùng một lần, chốt ca, hoàn tiền. [D] Toast/Loyverse. **R1 làm khác:** đóng ca và hoàn tiền KHÔNG bị khóa theo mạng; chỉ bước xin quản lý duyệt cần mạng.
- QR chuyển khoản offline: không xác nhận tự động được ⇒ thu ngân xác nhận tay + đánh dấu đối soát sau. [QĐ] **R1 làm khác:** máy quầy không có xác nhận tay; chuyển khoản chỉ được ghi khi ngân hàng báo về qua QR của đơn (mất mạng ⇒ thu tiền mặt).
- Đồng bộ: server là nguồn thật; realtime chỉ báo "có thay đổi" rồi máy đọc lại. [F]
- [QĐ] Mỗi đơn có `version` (khóa lạc quan); xung đột trên cùng bàn báo **ngay khi lưu**. [F] Odoo dùng `write_date` 1 giây và người ghi sau thắng.
- Quán có bàn + bếp cần **máy chủ/cầu nối cục bộ trong LAN** để bếp vẫn nhận phiếu khi mất internet. [D] Toast bắt buộc hub có dây.

## 21. Loại quán = dữ liệu mẫu + công tắc

Dữ liệu cho thấy: khác biệt nằm ở **tổ hợp công tắc**, không ở mã nguồn riêng. [F] Odoo chỉ có cờ restaurant/bar; [A][B][C].

| Công tắc / mẫu | Cafe | Trà sữa | Quán ăn | Bar | Tiệm bánh |
|---|---|---|---|---|---|
| Sơ đồ bàn | tùy | tắt | **bật** | bật | tắt |
| Trả trước / số gọi món | bật | **bật** | tắt | tab mở | bật |
| Course, giữ món | tắt | tắt | **bật** | tắt | tắt |
| Trạm bếp | 1 bar | 1 bar | **nhiều** | bar | ít |
| In tem dán ly | bật | **bật** | tắt | tắt | tem nhãn/hạn |
| Nhóm tùy chọn mẫu | nóng/đá, size, sữa | **size, đường, đá, topping** | ghi chú, món phụ | ly/shot | — |
| Bán thành phẩm theo mẻ | ít | **trân châu, cốt trà** | sơ chế | — | **mẻ bánh** |
| Bán theo cân / giá mở | — | — | tùy | — | **bật** |
| Quy đổi chai → ml | — | — | — | **bật** | — |
| Lô + hạn dùng | — | — | — | — | **bật** |
| Happy hour | tùy | tùy | tùy | **bật** | — |
| Giờ cắt ngày kinh doanh | 4h | 4h | 4h | **6h** | 4h |
| Giao hàng | bật | **bật** | bật | tắt | đặt lịch |
| Hóa đơn từ máy tính tiền | bắt buộc | bắt buộc | bắt buộc | bắt buộc | bắt buộc |

Ràng buộc giữa công tắc (ví dụ): course cần sơ đồ bàn + `dine_in`; trả trước loại trừ "trả sau theo bàn" trên cùng kênh; `auto_86_when_stock_zero` cần `track_stock`; QR `order_pay_later` cần sơ đồ bàn.

**R1 làm khác:** có mẫu theo loại quán (`packages/shop-templates`, T03-10) nhưng **chỉ những hàng R1 có chỗ chứa**: danh mục thực đơn, trạm, và các công tắc `tables`, `pay_first_counter`, `course_firing`, `kitchen_routing`, `cup_labels`; áp mẫu chỉ **thêm cái còn thiếu**, không ghi đè gì chủ quán đã đặt (D-119). Các hàng bỏ vì chưa có chỗ chứa: nhóm tùy chọn mẫu, bán thành phẩm theo mẻ, bán theo cân/giá mở (đặt ở từng món), quy đổi chai → ml, lô + hạn dùng, happy hour (công tắc cấp thương hiệu chưa có tác dụng; dùng bảng giá), giờ cắt ngày kinh doanh, giao hàng, hóa đơn. Mọi công tắc mặc định tắt trừ `pay_first_counter`; `pay_first_counter` và `tables` không ràng buộc nhau. Ràng buộc thật nằm ở `packages/feature-flags/src/feature-flag-catalog.ts`.

## 22. Ngoài phạm vi v1

Tính tiền theo giờ (bida, karaoke) [E] KiotViet có `isTimeType`; spa/đặt lịch; lương & hoa hồng; FIFO; FEFO theo lô; menu theo khung giờ; màn hình phụ; tích hợp API GrabFood/ShopeeFood; nhượng quyền có phân quyền dữ liệu riêng.

## 23. Câu hỏi mở — cần người trả lời

**User quyết (ảnh hưởng plan):**
1. Làm cho quán của mình/một khách, hay SaaS bán cho nhiều quán?
2. Quy mô lúc đầu (1 quán / vài chi nhánh / hàng trăm quán)?
3. Đội làm, stack quen dùng?
4. Thiết bị ở quầy (máy Windows, tablet Android, iPad, điện thoại)?
5. Hạn chót / ngân sách?
6. Bản đầu tiên phải có gì để đem ra quán dùng thật?

**Chủ quán / quản lý quán thật xác nhận:**
7. Hoàn một phần đơn có khuyến mãi: đòi lại khuyến mãi khi phần còn lại không đủ điều kiện, hay bỏ qua?
8. Khuyến mãi mặc định không cộng dồn, chọn cái có lợi nhất cho khách: đúng thói quen quán VN?
9. Điểm: tính trên tiền thực trả, làm tròn xuống số nguyên; hạng thẻ theo kỳ hay trọn đời; điểm có hết hạn?
10. Hủy món đã gửi bếp: có trả nguyên liệu về kho không? Ai được duyệt?
11. Có cần ghi nợ khách quen / công ty ở v1 không?

**Kế toán thuế:**
12. Đối chiếu văn bản gốc NĐ 254/2026 + TT 91/2026 (ngày hiệu lực, đối tượng, nội dung bắt buộc).
13. "Cuối ngày" gửi dữ liệu là theo lịch hay theo ca; có giờ chốt cụ thể?
14. Trả hàng sau khi đã có hóa đơn từ máy tính tiền: lập hóa đơn điều chỉnh hay chỉ ghi sổ?
15. Hộ khoán còn ngưỡng miễn không?

## 24. Chưa kiểm chứng — cần tài khoản dùng thử

Flow thao tác thật của **KiotViet FnB, Sapo FnB, CukCuk, iPOS** (topping, combo, bàn, bếp, ca, kiểm kê, khuyến mãi, phân quyền) chưa có nguồn nào. Cách lấp: user đăng ký dùng thử, Claude điều khiển Chrome đi từng màn hình và ghi flow. Ưu tiên: KiotViet FnB và CukCuk (thị phần lớn), rồi Sapo FnB.

Cũng chưa đọc: API của nhà cung cấp hóa đơn điện tử, đặc tả VietQR (giới hạn nội dung), checksum webhook PayOS, điều kiện đối tác GrabFood VN, KDS bản enterprise của Odoo.
