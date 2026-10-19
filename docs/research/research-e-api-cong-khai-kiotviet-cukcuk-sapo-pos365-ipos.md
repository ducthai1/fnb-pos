# Nghiên cứu E — API công khai của phần mềm F&B Việt Nam (CukCuk, KiotViet, Sapo, POS365, iPOS)

> Agent E (Haiku) không tự ghi file này; nội dung chép nguyên văn từ tin nhắn cuối của nó, 2026-10-19.
> **Ghi chú của người tổng hợp:** đề xuất số 10 ("bỏ nhóm tùy chọn min/max") KHÔNG được dùng. Lý do: các API này chỉ lộ ra HÓA ĐƠN đã bán, không lộ cấu hình menu, nên "không thấy min/max" không chứng minh là không có. Đợt 1 (file A) đã đọc được nhóm tùy chọn bắt buộc + giới hạn số lượng ở Toast và Square, và trà sữa cần "chọn đúng 1 mức đường".

## Kết luận nhanh

Chỉ CukCuk có tài liệu API công khai đọc được, và đó là nguồn có enum thật duy nhất. KiotViet chỉ có SDK bên thứ ba (không chính thức). POS365 chỉ có tên lớp trong DLL của NuGet. Sapo và iPOS không có tài liệu API.

## Tình trạng từng hãng

| Hãng | Nguồn | Trạng thái | Độ tin cậy |
|---|---|---|---|
| CukCuk (MISA) | [sainvoices.html](https://graphapi.cukcuk.vn/document/api/sainvoices.html), [branchs_setting.html](https://graphapi.cukcuk.vn/document/api/branchs_setting.html) | Đọc được: Hóa đơn, dòng hàng, thanh toán, mã ưu đãi, VAT điện tử, cấu hình chi nhánh. Không có: món/nhóm/combo/nguyên liệu/kho/ca/bàn (URL đoán 404, trang index chỉ có Account). | Cao (tài liệu chính thức), có vài lỗi nội bộ tài liệu |
| KiotViet | [kiotviet-fnb-sdk](https://www.npmjs.com/package/kiotviet-fnb-sdk) v1.1.0, [n8n-nodes-kiotviet-fnb](https://www.npmjs.com/package/n8n-nodes-kiotviet-fnb) v1.2.2 | open.kiotviet.vn là SPA rỗng; public.kiotapi.com redirect tới metadata không trả nội dung. SDK là bên thứ ba, một maintainer, không có enum đầy đủ. | Thấp-trung bình; chỉ dùng để đối chiếu |
| POS365 | NuGet [POS365.Models 1.3.39](https://www.nuget.org/packages/POS365.Models) (vendor POS ONE), [POS365.SDK 2.0.65](https://www.nuget.org/packages/POS365.SDK) | Không có docs. Chỉ trích được tên lớp/trường từ DLL (không giải mã được giá trị enum). Model nghiêng retail/ERP (Business Central). | Trung bình về tên, thấp về giá trị |
| Sapo FnB | developers.sapo.vn (nội dung rỗng), sapo.vn/api (404), fnb.sapo.vn (trang parking) | Không có API công khai | Không có |
| iPOS FABi | ipos.vn/api (404); tìm được tích hợp MoMo qua báo chí | Không có tài liệu API | Không có |

Đã thử: open.kiotviet.vn, public.kiotapi.com, graphapi.cukcuk.vn (swagger, index, articles, CHANGELOG), developers.sapo.vn, sapo.dev, fnb.sapo.vn, ipos.vn/api, developer.pos365.vn, npm và PyPI (tải về đọc, không chạy).

## Dữ liệu CukCuk [TL] (nguồn tốt nhất)

**Enum (chép nguyên giá trị):**
- `OrderType`: 1 phục vụ tại nhà hàng, 2 mang về, 3 giao tận nơi, 4 đặt chỗ trước.
- `PaymentStatus` (hóa đơn): 0 chưa thanh toán, 1 chưa thu tiền, 2 ghi nợ, 3 đã thu tiền, 4 đã hủy, 5 tạm hủy.
- `PaymentType`: 1 tiền mặt, 2 thẻ ATM, 3 VISA, 4 MasterCard, 5 ghi nợ, 6 thẻ voucher, 7 thẻ trả trước.
- `RefDetailType` (dòng hóa đơn): 1 món ăn, 2 món ăn thêm, 3 mặt hàng khác, 4 khuyến mại theo món.
- `InventoryItemType`: 1 món ăn, 2 món theo nguyên vật liệu, 3 món theo nhóm, 4 combo, 5 đồ uống đóng chai, 6 đồ uống pha chế, 7 mặt hàng khác, 8 nguyên vật liệu, 10 đồ uống theo nhóm. (Không có giá trị 9.)
- `PromotionType`: 1 khuyến mại chương trình, 2 món mời, 3 khuyến mại khác.
- `ApplyVoucherType`: 1 tất cả, 2 món ăn, 3 đồ uống, 4 tùy chọn.
- `DiscountType` (mã ưu đãi): 1 phần trăm, 2 số tiền.
- `StatusReleaseEInvoice`: -2 chưa phát hành, -1 phát hành lỗi, 0 đang phát hành, 1 đã phát hành, 2 chờ cấp mã, 3 gửi lỗi, 4 đã cấp mã, 5 từ chối cấp mã.
- `StatusSendToTax`: 0 chưa gửi, 1 đã gửi, 2 CQT tiếp nhận, 3 CQT không tiếp nhận, 4 gửi lỗi.

**Cấu trúc:**
- Hóa đơn (`SAInvoice`) 1-n dòng (`SAInvoiceDetail`, có `RefID`, `OrderDetailID`, `ParentID`), 1-n thanh toán (`InvoicePayment`), 1-n mã ưu đãi (`InvoiceCoupon`), 1-1 thông tin VAT điện tử (`SAVATInfo`).
- Bàn chỉ là `TableName` (chuỗi), không phải khóa ngoại [TL].
- Món thêm là một dòng riêng với `ParentID` trỏ về món chính, không nằm trong dòng cha [TL].
- Tách riêng: `DiscountAmount`, `ServiceAmount`, `VATAmount`, `DeliveryAmount`, `TipAmount`, `PromotionAmount`, và điểm (`AvailablePoint`, `UsedPoint`, `AddPoint`) [TL].
- Dòng hóa đơn có `AllocationAmount` (phân bổ khuyến mại xuống dòng) và `TaxRate`/`TaxAmount` [TL].
- Hủy chỉ có ở cấp hóa đơn (`CancelDate`, `CancelBy`, `CancelReason`). Không thấy hủy theo dòng [TL].

**Cấu hình chi nhánh [TL]:** `IsBaseDepot` (kho chính); VAT và phí dịch vụ tách riêng cho từng kênh (`VATForDelivery`, `VATForTakeAway`, `CalcServiceDelivery`, `CalcServiceTakeAway`); `IsCalcServiceAmountNotPromotion` (phí tính trước hay sau khuyến mại); phí theo % (`ServiceRate`) hoặc số tiền cố định (`AmountService`).

**Lỗi nội bộ tài liệu [TL]:** ví dụ JSON dùng `RefDetailID` trong khi định nghĩa là `RefDetailId`; `InvoicePayment.RefNo` khai là guid nhưng mô tả là số chứng từ; `WaiterEmployeeId` mô tả là "tên nhân viên" dù kiểu là guid; tài liệu branch ghi POST nhưng ví dụ dùng GET.

## Dữ liệu KiotViet (SDK bên thứ ba) [TL của SDK, không phải của KiotViet]

- **Sản phẩm:** `productType` (số, giá trị không có), `isTopping`, `isProcessedGoods`, `isTimeType`, `isTimeServices` (tính theo giờ), `isRewardPoint` (cờ tích điểm từng món), `hasVariants` + `attributes`, `units[]` (có `conversionValue`, `basePrice`), `masterUnitId`, `toppings[]` (liên kết món topping), `formulas[]` (định lượng: `productId`, `quantity`), `inventories[]` theo chi nhánh (`onHand`, `cost`, `reserved`), `priceBooks[]` có `startDate`/`endDate`.
- **Đơn:** `status` (số) + `statusValue` (chuỗi), `dinningOption` (số, giá trị không có), `orderDetails[]` có `rank`, `uuid`, `isStartTimeCounter`, `timeStartCounter`/`timeEndCounter`. Giao hàng: status 3 chưa giao, 4 đang giao (chú thích trong SDK). Không có trường bàn.
- **Hóa đơn:** `InvoicePayment` (`method` chuỗi, `statusValue`), `SaleChannel`.
- **Webhook (n8n node):** `customer.update/delete`, `product.update/delete`, `stock.update`. Không có sự kiện đơn.

## Dữ liệu POS365 (tên lớp trong DLL) [TL tên, SL ý nghĩa]

Có trong POS365.Models: `MenuItem`/`MenuItems`, `AddOnPrice`, `DoNotConsumeProducts`, `ItemType`, `CombinedPrice`, `PosLayout`/`PosLayoutButton`/`PosTiles` (lưới nút bấm), `PosHandlingType`, `PosReturnReason` (lý do trả hàng có danh mục), `PosSubPaymentType`, `PosPayoutTypes` (chi từ két), `CashRegisterEvent`, `CashStart`/`CashEnd`/`CashDiff`/`CashRegisterCount`/`Denominations` (sổ quỹ ca, đếm mệnh giá), `PosCommissionTemplates` (hoa hồng), `PosCampaignRewardProduct` (tặng món), `PosSerialNumber`, `PosLocationBin`.
Không có giá trị enum (cần giải mã DLL, chưa làm). POS365.SDK có `SaveStocks`, `RemoteStock`, `RemoteWfMasterStatus`, không có bàn/bếp.

## Bảng so sánh

| Chủ đề | CukCuk | KiotViet (SDK) | POS365 (model) |
|---|---|---|---|
| Topping/món thêm | Dòng riêng, loại 2, có `ParentID` | Cờ `isTopping` + `toppings[]` gắn món | `AddOnPrice`, `MenuItem` (cơ chế không rõ) |
| Combo | Loại hàng 4 rõ ràng | Không thấy | Không thấy |
| Đơn vị tính | Không lộ trong hóa đơn | `units[]` + `conversionValue` | `PosUnit`, `PosResourceUnitOfMeasure` |
| Định lượng | Loại 2 (món theo nguyên liệu) + loại 8, không có trường công thức | `formulas[]` có `quantity` | Không thấy |
| Trạng thái đơn | 0–5, có tạm hủy, ghi nợ | Số + chuỗi, giá trị không có | Không thấy |
| Kênh bán | 1–4 (phục vụ/mang về/giao/đặt chỗ) | `dinningOption` số, giá trị không có | `PosHandlingType`, giá trị không có |
| Ca/sổ quỹ | Không thấy | Không thấy | Có (`CashStart`/`End`/`Diff`, mệnh giá) |

## Xếp hạng nguồn để dùng

1. CukCuk (tài liệu chính thức): dùng làm chuẩn cho taxonomy đơn, thanh toán, loại hàng, cấu hình thuế/phí theo kênh.
2. POS365.Models (vendor package): dùng để tham chiếu ca/sổ quỹ và danh sách khái niệm, không dùng cho giá trị enum.
3. KiotViet SDK (không chính thức, một maintainer): dùng cho mô hình sản phẩm (topping, công thức, đơn vị quy đổi, cờ tích điểm, cờ tính giờ). Không dùng làm đặc tả.

Rủi ro adoption: cả hai SDK bên thứ ba đều có một maintainer; KiotViet SDK cập nhật lần cuối 2025-11, n8n node 2026-03. Không nên phụ thuộc chúng cho production.

## Khoảng trống (không tìm được nguồn)

- Nhóm tùy chọn có min/max (mô hình dự kiến "Nhóm tùy chọn"): không API nào trong 4 hãng có cấu trúc này. Cần cân nhắc có nên làm (YAGNI).
- Thời điểm trừ kho, kiểm kê, bán thành phẩm có tồn riêng, cờ tồn âm: không thấy trong API nào (CukCuk ghi rõ là không đề cập).
- Ngày kinh doanh (business date): không có trường riêng; chỉ có `RefDate` datetime.
- Chia bill/đơn con: không thấy quan hệ rõ ràng.
- Hủy món theo dòng, có lý do và duyệt: không thấy ở CukCuk (chỉ hủy hóa đơn).
- Giá trị enum của KiotViet (`productType`, `status`, `dinningOption`) và POS365: chưa xác minh.

## Khác biệt giữa các loại quán [SL, phần có căn cứ mỏng]

- Phục vụ tại bàn vs mang về vs giao vs đặt chỗ: đã có enum 4 kênh ở CukCuk, chỉ phục vụ tại bàn mới có tên bàn.
- Tính giờ (bi-a, karaoke, dịch vụ theo giờ): KiotViet có `isTimeType`/`isTimeServices`, timer trên dòng đơn. Là đặc thù của quán có tính giờ, không phải F&B thường.
- Combo/nguyên liệu: CukCuk tách loại hàng cho đồ uống đóng chai, đồ uống pha chế, nguyên liệu, nên cafe/trà sữa/quán ăn có tập loại hàng khác nhau.
- Chưa có căn cứ cho bar/bakery trong các API này.

## Tác động lên mô hình dự kiến

1. Kiểu phục vụ cần 4 giá trị, thêm "đặt chỗ" (booking). Kiểu bàn là khóa ngoại kèm tên snapshot, không chỉ chuỗi.
2. Tách trạng thái thanh toán đơn khỏi trạng thái hóa đơn điện tử (`einvoiceStatus` riêng, nhiều giá trị).
3. Thêm trạng thái "tạm hủy" bên cạnh "đã hủy".
4. Tùy chọn/món thêm nên thành dòng con có `parentLineId` và `lineType` (món, món thêm, con của combo, khuyến mại), snapshot tên, giá, thuế khi chốt. Không chỉ là giá nhúng trong dòng.
5. Cấu hình thuế/phí theo kênh, kèm cờ thứ tự tính phí so với khuyến mại.
6. Cờ sản phẩm: `isRewardPoint` (loại khỏi tích điểm), `isTimeType` (tính giờ), `hasVariants`.
7. Phạm vi voucher theo nhóm (món ăn, đồ uống, tùy chọn).
8. Ca/sổ quỹ: tiền đầu/cuối ca, chênh lệch, mệnh giá, chi từ két (tham chiếu POS365, cần xác nhận).
9. Dòng đơn snapshot: tên, mã, loại hàng, thuế, phần phân bổ khuyến mại.
10. Bỏ các nhóm tùy chọn min/max cho tới khi có yêu cầu cụ thể (không có bằng chứng từ API nào).

## Câu hỏi chưa giải quyết

- Giá trị enum của KiotViet (`productType`, `status`, `dinningOption`) và POS365 (cần giải mã DLL bằng công cụ .NET).
- CukCuk có tài liệu món/nhóm/kho/ca/bàn ở chỗ khác không (URL nội bộ chưa biết, không có trong index).
- Có developers.sapo.vn hoạt động hay không: WebFetch trả về rỗng, chưa xác minh được.
- Vì sao CukCuk không có giá trị 9 trong `InventoryItemType`.

Các file tải về (chỉ để đọc, không chạy) nằm tại `/tmp/claude-1000/-home-datadevice-GrowX-growx-claude-knowledge/bf1a862d-bdb6-4a85-b398-c2f3d3446455/scratchpad/downloads-e/`.

Sources:
- [CukCuk SAInvoice](https://graphapi.cukcuk.vn/document/api/sainvoices.html)
- [CukCuk Branch Setting](https://graphapi.cukcuk.vn/document/api/branchs_setting.html)
- [CukCuk API index](https://graphapi.cukcuk.vn/document/api/index.html)
- [kiotviet-fnb-sdk](https://www.npmjs.com/package/kiotviet-fnb-sdk)
- [n8n-nodes-kiotviet-fnb](https://www.npmjs.com/package/n8n-nodes-kiotviet-fnb)
- [POS365.Models](https://www.nuget.org/packages/POS365.Models)
- [POS365.SDK](https://www.nuget.org/packages/POS365.SDK)
- [cukcuk PyPI](https://pypi.org/project/cukcuk/0.5.3/)