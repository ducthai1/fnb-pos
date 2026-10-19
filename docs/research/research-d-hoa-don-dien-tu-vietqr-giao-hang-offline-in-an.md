# Research D — Hóa đơn điện tử, VietQR/thanh toán, app giao hàng, offline, in ấn tại quầy (POS F&B Việt Nam)

Ngày: 2026-10-19. Phạm vi: pháp lý VN + tích hợp + vận hành quầy. Nhãn: [TL] = tài liệu/văn bản (link); [SL] = suy luận.

## Mục lục
- D1. Hóa đơn điện tử từ máy tính tiền — ĐÃ XONG (xem bên dưới)
- D2. Thanh toán không tiền mặt — ĐÃ XONG (thiếu POS thẻ, ví)
- D3. App giao hàng — ĐÃ XONG (Be: không có dữ liệu)
- D4. Offline — ĐÃ XONG (thiếu Odoo, KiotViet/CukCuk)
- D5. In ấn & thiết bị — ĐÃ XONG (thiếu hệ gọi số, cân, màn phụ)
- Khoảng trống — ĐÃ XONG
- Khác biệt giữa các loại quán — ĐÃ XONG
- Tác động lên mô hình — ĐÃ XONG

## D1. Hóa đơn điện tử khởi tạo từ máy tính tiền (MTT)

**Cảnh báo văn bản đang hiệu lực [TL]:** NĐ 70/2025 KHÔNG còn là văn bản cuối. NĐ 254/2026/NĐ-CP có hiệu lực từ 01/07/2026 (một nguồn ghi 30/06/2026 là ngày có hiệu lực, 01/07/2026 là ngày bắt buộc; chưa đối chiếu được công báo). TT 91/2026/TT-BTC ban hành 30/06/2026, hiệu lực 01/07/2026, thay thế hướng dẫn cũ (TT 32/2025 hết hiệu lực). Hóa đơn lập trước đó điều chỉnh/thay thế theo NĐ 254/2026 + TT 91/2026. → Thiết kế theo NĐ 254/2026 + TT 91/2026, không theo 70/2025.
- Nguồn: [MISA helpact](https://helpact.misa.vn/?p=85385), [MISA eShop đối tượng](https://www.misaeshop.vn/22643/doi-tuong-nao-bat-buoc-su-dung-hoa-don-khoi-tao-tu-may-tinh-tien/), [EY VN (PDF mã hóa, không đọc được)](https://www.ey.com/content/dam/ey-unified-site/ey-com/vi-vn/technical/tax/documents/ey-vn-decree-254-on-electronic-invoices-and-electronic-documents.pdf), [MISA Thông tư 91](https://www.misaeshop.vn/44493/thong-tu-91-2026-tt-btc-huong-dan-nghi-dinh-254-2026-nd-cp/). thuvienphapluat.vn và vbpl trả 403 cho WebFetch; không đọc được văn bản gốc.

### 1. Đối tượng bắt buộc [TL, qua nguồn thứ cấp]
- Tổ chức + hộ/cá nhân KD bán hàng/dịch vụ **trực tiếp người tiêu dùng** thuộc: TTTM, siêu thị, bán lẻ (trừ xe cơ giới), ăn uống/nhà hàng, khách sạn, vận tải khách, vui chơi giải trí, chiếu phim, một số dịch vụ cá nhân (NĐ 254 Điều 6 khoản 1 điểm c, d).
- Hộ/cá nhân KD có doanh thu **> 1 tỷ/năm**, bất kể ngành.
- Hộ/cá nhân bán tài sản phải đăng ký quyền sở hữu/sử dụng, bất kể doanh thu.
- Hộ dưới 1 tỷ không thuộc diện bắt buộc: tự nguyện. [SL] Quán cafe/trà sữa/quán ăn của hộ nhỏ đều thuộc nhóm "ăn uống/bán lẻ trực tiếp" → BẮT BUỘC dù doanh thu thấp. Đây là điểm quan trọng nhất cho sản phẩm.
- Hộ khoán: nguồn không nói rõ. Hộ khoán dưới 100 triệu/năm không bắt buộc HĐĐT (TT 40/2021, [nguồn Sapo/MISA đã dẫn qua WebFetch misaeshop 28089]) — [SL] ngưỡng này cần đối chiếu lại vì TT 40/2021 đã bị thay thế; không tìm được văn bản thay thế xác nhận.
- Bỏ thuế khoán từ 2026: không tìm được văn bản xác nhận trong đợt này. Ghi KHÔNG TÌM THẤY.

### 2. Thời điểm lập hóa đơn
- NĐ 70/2025 (nguồn misaeshop 28089) [TL, thứ cấp]: lập **theo từng lần bán hàng hóa/cung cấp dịch vụ, không phân biệt giá trị**. Hộ có MTT bán trực tiếp phải dùng HĐ khởi tạo từ MTT.
- NĐ 254/2026: không tìm được nguồn nêu rõ điều khoản thời điểm bán lẻ. Hóa đơn có trường "thời điểm lập" bắt buộc (NĐ 254 Điều 10 khoản 4) [TL, thứ cấp].
- [SL] Thiết kế: mỗi lần thanh toán xong = 1 hóa đơn (không gom cuối ngày). Gom theo ngày chỉ là cách chuyển dữ liệu, không phải cách lập.

### 3. Nội dung bắt buộc (NĐ 254 Điều 10 khoản 4) [TL, thứ cấp]
- Người bán: tên, địa chỉ, MST.
- Người mua: CHỈ khi khách có nhu cầu — tên, địa chỉ, MST, hoặc số định danh cá nhân, hoặc SĐT (theo quy định). Khách vãng lai không yêu cầu → không bắt buộc.
- Hàng/dịch vụ: tên, số lượng, đơn giá, tổng tiền thanh toán. Nếu khấu trừ GTGT: tách giá chưa thuế, thuế suất, tiền thuế.
- Thời điểm lập.
- Thông tin xác thực CQT: mã CQT (HĐ có mã) hoặc dữ liệu tra cứu. Hóa đơn từ MTT có ký hiệu mẫu chứa chữ **M** [TL, TT 91 qua nguồn thứ cấp].
- Không bắt buộc chữ ký số (HĐ in từ MTT) [TL, thứ cấp]. Phải nhận biết được HĐ có kết nối CQT.

### 4. Chuyển dữ liệu & mã CQT
- **Cuối ngày** gửi dữ liệu HĐ MTT đến CQT (NĐ 254 Điều 15) [TL, thứ cấp: helpact.misa.vn]. Phần mềm nhắc 20h.
- Không tìm được quy định "không kết nối được" → KHÔNG TÌM THẤY.
- Phạt chậm chuyển (NĐ 125/2020 Điều 30) [TL, thứ cấp]: 1–5 ngày làm việc: 2–5 triệu; 6–10 ngày hoặc bảng tổng hợp thiếu: 5–8 triệu; ≥11 ngày: 10–20 triệu.
- [SL] Hệ quả thiết kế: cần job "chốt ngày" (end-of-day close) tạo bảng tổng hợp + gửi CQT; cảnh báo nếu còn HĐ chưa gửi khi phát hành HĐ đầu ngày mới.

### 5. Sai sót / điều chỉnh / thay thế [TL, thứ cấp: misaeshop 28089 — NĐ 70 nhưng logic vẫn dùng]
- Chưa gửi khách: xoá, lập HĐ mới (không cần biên bản).
- Đã gửi, chưa kê khai thuế: lập HĐ điều chỉnh hoặc biên bản thu hồi rồi lập lại.
- Đã kê khai: bắt buộc HĐ điều chỉnh; HĐ gốc không xoá/thay.
- **HĐ từ MTT: không điều chỉnh/huỷ sau khi lập.** Sai sót ghi vào sổ kế toán, báo CQT ở kỳ kê khai gần nhất. [TL, thứ cấp]
- Khách trả hàng/đổi làm đổi giá trị: lập HĐ điều chỉnh (NĐ 70 khoản trả hàng). [TL, thứ cấp: tvpl hỏi đáp qua nguồn thứ cấp]
- [SL] Mâu thuẫn: "HĐ MTT không điều chỉnh/huỷ" vs "trả hàng phải lập HĐ điều chỉnh". Giải pháp thiết kế: bill MTT là bất biến; trả hàng/hoàn tiền = sự kiện đảo (reversal) có liên kết, và nếu cần thì phát HĐ điều chỉnh qua kênh khác — cần xác nhận với kế toán thuế.

### 6. Tích hợp nhà cung cấp HĐ (VNPT, Viettel, MISA, BKAV, EasyInvoice...)
- Mô hình chung [SL, từ cấu trúc nghị định + tài liệu MISA]: POS → API nhà cung cấp (tạo HĐ + dữ liệu) → nhà cung cấp ký/cấp mã CQT → gửi CQT (cuối ngày) → trả về mã CQT + mã tra cứu/QR. Lưu ý: nhà cung cấp phải là đơn vị được CQT cho nhận/truyền dữ liệu (Tổ chức cung cấp dịch vụ nhận-truyền-lưu).
- Khách lấy HĐ sau: in trên bill mã tra cứu/QR + link tra cứu của nhà cung cấp; khách nhập MST/SĐT/CCCD để xuất HĐ "bù" thì đó là HĐ có mã lập sau — [SL] phải kiểm nghĩa vụ "lập theo từng lần" với HĐ lập muộn (không tìm được nguồn).
- Chi tiết API từng nhà cung cấp: CHƯA ĐỌC (ngoài budget). Không tìm được tài liệu API công khai dạng văn bản qua WebSearch → KHÔNG TÌM THẤY chi tiết endpoint.

### Ca khó D1
- Hộ dưới 1 tỷ nhưng bán lẻ: bắt buộc (theo ngành). Phải có cờ "đối tượng HĐ" theo cửa hàng, không theo doanh thu đơn lẻ.
- Mất mạng: HĐ MTT phải gửi CQT cuối ngày → offline (D4) phải có hàng đợi HĐ, không được mất bill.
- Ngày chuyển đổi 30/06 vs 01/07/2026: đặt cờ phiên bản quy định, không hardcode.

## D2. Thanh toán không tiền mặt (VietQR, webhook, đối soát)

### Chuẩn QR [TL, thứ cấp]
- VietQR = chuẩn EMVCo QR (NAPAS 247 / FastFund IBFT, EMVCo 1.5.2), theo chuẩn cơ sở NHNN. Nguồn: [thư viện PHP VietQR (Packagist)](https://packagist.org/packages/liopay/vietqr), [VTV/NAPAS 2021](https://english.vtv.vn/news/napas-unveils-unified-qr-code-system-for-bank-transfers-2021062123463189.htm). Không tìm được PDF đặc tả NAPAS v1.5.2 công khai qua tìm kiếm → chưa xác minh sub-ID field.
- Field 62 (Additional Data) là tùy chọn; sub-ID 08 = mục đích giao dịch (nội dung), ví dụ "thanh toan don hang" [TL, thứ cấp decode demo]. Field "bill number" có trong một thư viện nhưng không xác minh được ID số → KHÔNG TÌM THẤY ID chính xác.
- Loại khởi tạo: 11 = Static (tái sử dụng), 12 = Dynamic (một lần, có số tiền) [TL, thứ cấp]. QR động có số tiền + nội dung = mô hình cần cho POS.
- Giới hạn độ dài nội dung chuyển khoản (ví dụ 50 ký tự): KHÔNG TÌM THẤY xác nhận. Không đưa con số này vào thiết kế nếu chưa có đặc tả.
- Hạn mức: chuyển nhanh NAPAS 247 qua QR < 500 triệu/giao dịch [TL, báo chí thitruongtaichinhtiente.vn]. Giới hạn của từng ngân hàng khác nhau → cấu hình theo ngân hàng.

### Sinh QR: img.vietqr.io / api.vietqr.io [TL, một phần]
- Trang API tạo mã vietqr.io trả 404 khi WebFetch → KHÔNG xác minh được tham số URL hiện hành. Biết qua tài liệu chung: có API lấy token + API tạo QR (cần đăng ký merchant) [TL: [mô tả workflow VietQR](https://api.vietqr.vn/en/vn/overview/description-of-vietqr-api-workflow)].
- Workflow VietQR: merchant tự cung cấp Get Token API + Transaction Sync API để VietQR gọi về khi có biến động số dư (BĐSD). Có Test Callback API để giả lập thanh toán ở sandbox [TL].
- [SL] Không cần đăng ký API ngoài: sinh QR động tự build theo EMVCo (CRC16) từ bank BIN + số TK + số tiền + nội dung → hiển thị bằng QR client-side. Đây là phương án ít phụ thuộc nhất; cần test với app ngân hàng thật.

### Xác nhận tự động: SePay / PayOS / Casso
**SePay** [TL, docs.sepay.vn/lap-trinh-webhooks + developer.sepay.vn]:
- Webhook POST JSON. Trường đọc được trong code mẫu: `gateway`, `transactionDate`, `accountNumber`, `subAccount`, `transferType` (`in`/`out`), `transferAmount`, `accumulated`, `code`, `content`, `referenceCode`, `description`. Không thấy trường `id` trong trang này → KHÔNG xác nhận khóa idempotency tự nhiên.
- Xác thực: hoặc không cần, hoặc API Key trong header (tên header KHÔNG tìm thấy). Khuyến nghị whitelist IP SePay.
- Phản hồi: code mẫu trả `success` true/false. KHÔNG tìm thấy HTTP code nào được coi là thành công, KHÔNG tìm thấy chính sách retry.
- Khớp mã: trang không mô tả. Tham số tạo webhook: `is_verify_payment`, `skip_if_no_code`, `event_type` (All/In_only/Out_only), `only_va` [TL, developer.sepay.vn API Webhooks].
- Giới hạn: không xác nhận khớp mã đơn theo `content` như thế nào (tiền tố? nguyên chuỗi?) → KHÔNG TÌM THẤY.

**PayOS** [TL, thứ cấp: SDK npm/nuget/pypi]:
- Tạo link thanh toán: `orderCode`, `amount`, `description`, `cancelUrl`, `returnUrl` bắt buộc; `signature` tùy chọn. Response có checkoutUrl + qrCode.
- Webhook payload (từ README .NET mẫu): `orderCode`, `amount`, `description`, `reference`, `transactionDateTime`, `paymentLinkId`, `signature`. Xác thực bằng checksum key (HMAC, thuật toán và cách sắp xếp trường CHƯA xác minh; tài liệu gốc payos.vn không truy cập được — developer.payos.vn lỗi DNS).
- Có `confirmWebhook` để đăng ký URL. [SL] Ưu điểm: có orderCode → khớp đơn chắc chắn hơn so với khớp nội dung CK tự do.

**Casso**: không tìm được tài liệu trong đợt này → KHÔNG TÌM THẤY (chưa kiểm).

### Ca khó D2 [SL, cần kiểm bằng sandbox]
- Khách chuyển thiếu/thừa: webhook trả số tiền thực → so với số tiền đơn; thiếu → trạng thái "thanh toán một phần" (không tự đóng đơn); thừa → ghi nhận tiền thừa/tip (đừng tự hoàn).
- Sai nội dung/không có mã: webhook vẫn đến với `content` lạ → đưa vào hàng đợi "giao dịch chưa khớp" để thu ngân gán tay. SePay có `skip_if_no_code` → tín hiệu này có sẵn.
- Chuyển 2 lần cùng đơn: đơn đã đủ → giao dịch thứ 2 thành "thừa", không tự đánh dấu 2 lần thanh toán.
- Webhook trễ/trùng: webhook có thể đến sau khi thu ngân đã bấm "thu tiền mặt" → cần khóa đơn tại thời điểm đóng; idempotency theo (gateway + referenceCode/orderCode) — không xác nhận được referenceCode có duy nhất hay không.
- Hoàn tiền: không có API hoàn tiền qua webhook; hoàn tiền = chuyển khoản ra ngoài (`transferType=out`) do người dùng làm thủ công → ghi nhận như sự kiện đảo, không tự động.
- Webhook không đến (mạng/bank): cần nút "kiểm tra thủ công" + đối soát cuối ca bằng sao kê.
- Phải whitelist IP / bảo mật endpoint cục bộ: đẩy webhook về cloud, POS offline (D4) không nhận được → hàng đợi phía cloud.

### Đối soát cuối ca [SL]
- So: tổng tiền mặt (đếm két) + tổng QR khớp (webhook) + tổng thẻ (sao kê máy POS thẻ) vs tổng bill. Chênh lệch phải có lý do.
- Mốc ca tách theo "business date" (D không khớp với giờ sao kê ngân hàng).

### Ví MoMo / ZaloPay / VNPay QR, POS thẻ
- Chưa tìm được tài liệu trong đợt này → KHÔNG TÌM THẤY chi tiết API. Ghi nhận: ví có cổng riêng, không nằm trong VietQR.
- POS thẻ ngân hàng: không khảo sát được trong budget → KHÔNG TÌM THẤY (chưa biết máy tích hợp hay rời ở VN).

## D3. App giao hàng (GrabFood, ShopeeFood, Be)

### Tóm tắt
- **GrabFood**: có API đối tác chính thức (partner-api), nhưng cần đối tác được cấp quyền. Đây là API trực tiếp, không cần aggregator — nếu được cấp.
- **ShopeeFood VN**: không thấy API công khai. Đường đi thực tế là qua đối tác tích hợp (Sapo, và POS khác) — KHÔNG phải API trực tiếp của bạn. Chưa xác minh điều kiện cấp.
- **Be (beFood)**: KHÔNG TÌM THẤY tài liệu đối tác. Một nhà cung cấp POS (VietPOS) tự nhận có đồng bộ Be — chỉ là lời quảng cáo, chưa xác minh.

### GrabFood [TL: SDK chính thức của Grab, github.com/grab/grabfood-api-sdk-java, API v1.1.3]
- Base: OAuth2 tại `https://api.grab.com/grabid/v1/oauth2/token` (client_credentials, scope `food.partner_api`, client_id/secret). Partner API: `https://partner-api.grab.com/grabfood`. Bearer token, tái dùng đến khi hết hạn.
- Luồng và endpoint chính (TL):
  - Đơn: `GET /partner/v1/orders`; nhận/từ chối `POST /partner/v1/order/prepare`; đánh dấu sẵn sàng `POST /partner/v1/orders/mark`; đổi giờ sẵn sàng `PUT /partner/v1/order/readytime`; trạng thái giao `POST /partner/v1/order/delivery`; huỷ `PUT /partner/v1/order/cancel` + kiểm tra `GET /partner/v1/order/cancelable`; hoàn tiền `POST /partner/v1/orders/refund`; sửa đơn V1/V2.
  - Đồng bộ đơn từ POS: `POST /partner/v1/pos/order` (đơn tại quán/POS → Grab).
  - Menu: `PUT /partner/v1/menu` (một món), `PUT /partner/v1/batch/menu` (hàng loạt), `GET /partner/v1/merchant/menu/trace` (theo dõi đồng bộ), `POST /partner/v1/merchant/menu/notification` (báo menu đổi).
  - Bật/tắt: `GET .../store/status`, `PUT /partner/v1/merchant/pause` (tạm ngưng quán). Giờ mở: `.../store/opening-hours`, `.../store/dine-in-hours`, `special-opening-hour`.
  - Khuyến mãi/thành viên/dine-in: `campaigns`, `dinein/voucher`, `dinein/voucher/redeem`, `membership/notify`, `dinein/sto/qrcode`.
- Webhook: README chỉ nêu model `MenuSyncWebhookRequest`, `PushIntegrationStatusWebhookRequest`; KHÔNG thấy đường dẫn callback đơn hàng mới → chưa xác nhận cơ chế nhận đơn mới (push hay poll `GET /orders`). Cần đọc developer.grab.com (trang Grab Developer không mở được nội dung).
- Đối tác: README không nêu điều kiện; trang Grab Developer không đọc được. Một vendor POS (Klikit, nói về Singapore) mô tả đăng ký partner.grab.com, cấp API key, duyệt 3–5 ngày làm việc [TL, thứ cấp, không phải VN]. Mosaic nói phải email account manager. Mâu thuẫn → KHÔNG xác nhận.
- Chấp nhận đơn: manual hoặc auto (cấu hình trong hệ thống Grab) [TL, thứ cấp].
- Giá: menu nên đặt giá CHƯA thuế, thuế do Grab xử lý [TL, thứ cấp Qashier — nguồn nước ngoài, cần kiểm cho VN].
- Hoa hồng/đối soát VN: KHÔNG TÌM THẤY.
- [SL] Vì endpoint `POST /partner/v1/pos/order` tồn tại, Grab thiết kế để POS đẩy đơn vào — chứng tỏ có mô hình POS-tích-hợp trực tiếp.

### ShopeeFood VN [TL: Sapo blog/help, thứ cấp, vendor]
- Đường kết nối: qua đối tác (Sapo) — quét QR xác thực, "không cần chờ phê duyệt" (so với ~48 giờ thủ công) [TL: sapo.vn/cap-nhat-tinh-nang/ket-noi-shopeefood]. Đây là aggregator/đối tác POS chứ không phải API trực tiếp.
- Đồng bộ: mặt hàng + topping từ POS lên ShopeeFood; có giá riêng theo kênh ShopeeFood. Bật/tắt món: KHÔNG TÌM THẤY trong nguồn Sapo.
- Đơn: chủ quán nhận/từ chối trên POS; tự nhận sau 2 phút (cấu hình). Trạng thái shipper lấy hàng/giao thành công được về POS. Tồn kho tự trừ khi có đơn [TL].
- Hủy đơn: KHÔNG TÌM THẤY.
- Hoa hồng: **20–25%/đơn thành công, tùy chính sách từng thời điểm**, trừ trước khi quyết toán vào ví quán; không phí đăng ký/duy trì [TL: sapo.vn/blog/shopeefood-merchant — trang có mâu thuẫn nội bộ, ghi "Merchant ngừng 8/2022", ngày 2026; cần đối chiếu help.cs.shopeefood.vn]. Chưa đối chiếu với nguồn chính thức.
- Điều kiện đăng ký (ATTP, giấy tờ): KHÔNG TÌM THẤY trong trang này.
- Luồng menu trong Shopee Partner app (sửa giá, ảnh, topping, ẩn hết hàng, giờ mở, "Quán bận"): TL thứ cấp, không chắc còn đúng với Shopee Partner.

### Be (beFood) [SL/KHÔNG TÌM THẤY]
- Không có tài liệu đối tác. Chỉ thấy VietPOS (vietductri.com) quảng cáo bản 2026 có "đồng bộ GrabFood/ShopeeFood/Be" — không có chi tiết API → chỉ là tín hiệu thị trường, chưa xác minh.

### Mô hình tham chiếu: aggregator quốc tế [TL: Deliverect docs, developers.deliverect.com]
- Luồng chuẩn: đăng ký POS webhook URL → đồng bộ sản phẩm → cấu hình webhook thông báo đơn mới → cập nhật trạng thái đơn ngược lại. Đây là mô hình để thiết kế bộ adapter chung.
- Delivery Hero Q-Commerce (Order Transmission API + Assortment API, một token, webhook trạng thái) [TL, thứ cấp] — tham chiếu cấu trúc, không áp dụng cho ShopeeFood.
- Wolt: webhook "ready" không chứa đủ chi tiết đơn, phải gọi resource_url [TL] → adapter phải coi webhook chỉ là tín hiệu, rồi fetch đơn.

### Hệ quả cho sản phẩm [SL]
- Một lớp "kênh giao hàng" (channel adapter): Grab (API trực tiếp, nếu được cấp), Shopee (qua đối tác), Be (chưa rõ). Mô hình nội bộ không được phụ thuộc đặc thù nhà cung cấp.
- Menu có giá theo kênh (channel price) + cờ bật/tắt theo kênh; "86 món" phải đẩy lên kênh.
- Đơn từ kênh = loại đơn riêng (channel order), có mã đơn bên ngoài, snapshot món như bill thường; trừ kho theo cùng cơ chế.
- Đối soát: hoa hồng 20–25% (Shopee) → cần trường phí sàn trên dòng đối soát; không nhập tay.
- Trễ/ mất mạng: đơn kênh không được mất khi POS offline (xem D4) — phải nhận qua cloud.

## D4. Bán khi mất mạng (offline)

### Toast [TL: support.toasttab.com "Using Toast in Offline Mode"]
- Vào offline sau ~40 giây mất kết nối. Hoạt động: đơn mới tại POS/Toast Go, thẻ + tip (nếu background card processing bật — mặc định bật), in bill + két (nếu cáp Ethernet còn), KDS đơn tại quán (có điều kiện), clock in/out cùng một máy.
- KHÔNG hoạt động: gift card, loyalty (không tích/đổi điểm), Online Ordering, Mobile Order & Pay (chỉ thanh toán bill có sẵn), **sửa menu, 86 món, đổi giá**, chốt ca (đóng check, đối soát tiền mặt/tip), pre-auth (trừ khi đã pre-auth trước), payroll không khuyến nghị.
- Thanh toán offline ở trạng thái Pending đến khi có mạng; auto-capture khi có lại mạng; báo cáo loại dữ liệu máy offline đến khi sync xong.
- **Không đồng bộ giữa các máy khi offline**: đơn trên máy A không hiện ở máy B. Khuyến nghị: mỗi nhân viên dùng 1 máy.
- Cần "local hub": ít nhất 1 thiết bị có dây không phải Elo V1 làm hub, mọi thiết bị cùng subnet.
- Số đơn offline: KHÔNG TÌM THẤY (có nêu đơn mới nhưng không nói đánh số ra sao).
- Xung đột khi sync: KHÔNG TÌM THẤY.
- Giới hạn thời gian/số đơn: KHÔNG TÌM THẤY.

### Square [TL: help.squareup.com, Square Townsquare, thứ cấp]
- Offline payments lưu trong app, tự xử lý khi có mạng: "trong 24 giờ, tối đa 72 giờ" [TL: help center ghi 24h/72h; Townsquare ghi 24h]. Quá hạn → giao dịch hết hạn, không nhận tiền.
- Phải bật trước khi offline (từ 4/2026 tự bật cho máy không làm gì). [TL, thứ cấp]
- Thẻ chạm vật lý KHÔNG chạy offline; ví số (Apple/Google Pay) chạy offline; Afterpay, Cash App Pay, gift card, nhập tay: không.
- Giới hạn mỗi thẻ $100 là của MỘT merchant (Squishable), KHÔNG phải của Square → không dùng làm chuẩn.
- Mọi giao dịch offline là "chưa xác thực" tới khi sync → thẻ bị từ chối/gian lận rơi vào quán [TL: phân tích bên thứ ba]. → Rủi ro chính.

### Loyverse [TL: help.loyverse.com/help/offline-work-of-pos]
- Vẫn bán, có ca (shift). KHÔNG offline: hoàn tiền, đăng ký khách mới, thêm món, một số chức năng khác. Tồn kho ẩn khi offline. Thẻ tích hợp không chạy offline.
- Đơn offline lưu máy, đánh dấu chưa đồng bộ; có mạng tự sync về Back Office; **đăng xuất khi còn đơn chưa sync = mất đơn**.
- Xung đột: KHÔNG TÌM THẤY trong nguồn Loyverse.

### Odoo POS [TL, một phần]
- Trang tài liệu Odoo POS offline trả 404 → KHÔNG xác minh. Tài liệu Odoo chung: cache dữ liệu, giới hạn 2 GB, xoá dữ liệu cũ nhất trước; bản Odoo chung chỉ xem record đã mở, không sửa [TL, thứ cấp: tài liệu offline chung]. Add-on bên thứ ba cho phép tạo hoá đơn offline — không phải hành vi chính thức.
- Chi tiết sync đơn POS, vai trò IoT box: KHÔNG TÌM THẤY.

### Việt Nam (KiotViet, CukCuk, iPOS)
- KHÔNG TÌM THẤY xác nhận chế độ offline. KiotViet/iPOS được mô tả là cloud/điều khiển từ xa; CukCuk: không đề cập offline. Không suy ra được gì — cần test thực tế trên mạng bị cắt.

### Tổng hợp mẫu thiết kế [SL, dựa trên 4 hệ thống]
- Thứ bậc: **bán offline được** = đơn mới + thẻ/QR đã có + in + két + ca đơn giản. **Không được offline** = đổi menu/giá, 86 món, khuyến mãi phức tạp, loyalty, chốt ca/đối soát, hoàn tiền (Loyverse), đơn kênh giao hàng/online.
- Đánh số đơn: [SL] cấp dải số riêng cho mỗi thiết bị (ví dụ `<mã máy>-<seq>`) để không đụng nhau khi sync; số hiển thị cho khách vẫn có thể là số ngắn theo ca.
- Đồng bộ + xung đột: [SL] bản ghi append-only (sự kiện bán, sự kiện kho), không ghi đè trạng thái; xung đột (2 máy cùng sửa một bàn) → sự kiện đều được giữ, bàn ở trạng thái "cần kiểm tra" thay vì chọn bừa bản mới nhất.
- Giới hạn thời gian offline: [SL] đặt cấu hình (ví dụ 24h như Square), quá giới hạn thì chặn thanh toán thẻ offline.
- Máy chủ LAN tại quán (local hub) [TL: Toast bắt buộc local hub, KDS]: [SL] nên có máy chủ/SQLite cục bộ cho bếp + in + két; cloud là nơi đồng bộ đa chi nhánh. Chỉ cloud = mất bếp khi mất mạng.
- Thẻ/hoàn tiền offline: [SL] không cho hoàn tiền offline (Loyverse không hỗ trợ) — giảm rủi ro.
- Hoá đơn điện tử (D1) khi offline: HĐ phải gửi CQT cuối ngày → hàng đợi HĐ lưu cục bộ, gửi lại khi có mạng; quá hạn → cảnh báo.

## D5. In ấn & thiết bị tại quầy

### Các đường in từ web/tablet
| Đường | Cách | Cần cầu nối cục bộ? | Nguồn |
|---|---|---|---|
| Epson ePOS-Print (HTTP/XML) | Trang gửi XML tới máy in IP (`/cgi-bin/epos/service.cgi`) | Không, nếu máy in cùng LAN và HTTP. Chi tiết SDK: KHÔNG ĐỌC được (epson-biz.com đã đóng 2024, chuyển sang epson.sn) | [TL, thứ cấp: thông báo trang] |
| Star WebPRNT (HTML/JS) | JS SDK gửi request tới máy in (chỉ máy WEBPRNT) | Không cần app; nhưng **trang HTTPS → request phải HTTPS**, máy in phải cấu hình chứng chỉ; hỗ trợ TLS theo model | [TL, thứ cấp: manual Star] |
| Star StarXpand SDK for Web | Chrome-only, hợp tác Google Chrome team (NRF 2026) | Không cần app theo quảng cáo | [TL, thứ cấp, marketing] |
| QZ Tray | Helper desktop cài trên MỖI máy trạm, gửi raw ESC/POS, in im lặng (không hộp thoại), chứng chỉ ký | **Có** — phải cài trên mỗi máy kết nối máy in | [TL: qz.io wiki/docs, thứ cấp] |
| Odoo IoT Box | Thiết bị Raspberry Pi trong quán, nối máy in USB/LAN, két qua cáp RJ25 của máy in | **Có** (phần cứng cục bộ) | [TL: doc Odoo 16 IoT POS] |
| Module ESC/POS LAN bên thứ ba (Odoo) | Odoo đẩy ESC/POS trực tiếp tới máy in mạng | Không cần IoT box, nhưng là module cộng đồng/trả phí | [TL, thứ cấp] |
| WebUSB / Web Bluetooth | Chỉ Chromium; **HTTPS hoặc localhost bắt buộc**; **phải có click/gesture** để mở hộp chọn thiết bị; không tự dò được; Safari/Firefox không hỗ trợ | Trình duyệt là cầu nối nhưng hạn chế; Bluetooth ổn định hơn USB trên macOS (USB bị driver hệ thống giữ) | [TL, thứ cấp: Chromium code review, Openbravo] |

### Két tiền
- Két mở qua chân cắm ở máy in (cáp RJ25 trên máy in nhiệt, lệnh ESC/POS kick) [TL: Odoo IoT docs]. Không có máy in → không mở két. Két đứng riêng cần mạch relay riêng → KHÔNG TÌM THẤY chi tiết.
- Event "két mở/đóng" có trong Star WebPRNT (onCashDrawerOpen/Close) [TL]; ESC/POS thường không báo lại trạng thái → chỉ biết đã gửi lệnh.

### Các thiết bị khác
- Máy in tem dán ly, in bếp, in theo trạm (bar/bếp/quầy): KHÔNG TÌM THẤY nguồn riêng. [SL] Cùng đường ESC/POS hoặc ZPL/TSPL (QZ Tray hỗ trợ ZPL, EPL, TSPL... [TL: qz.io]).
- Màn hình phụ cho khách: KHÔNG TÌM THẤY trong đợt này.
- Thẻ rung / hệ gọi số (pager): KHÔNG TÌM THẤY.
- Máy cân (cân điện tử tại quầy): KHÔNG TÌM THẤY (giao thức serial/USB không khảo sát được).
- Máy POS thẻ rời vs tích hợp: KHÔNG TÌM THẤY (xem D2).

### Kết luận có ràng buộc (cần app native/cầu nối)
- [SL] **Bắt buộc có tầng cục bộ** (app desktop/Electron, máy chủ LAN, hoặc IoT box) cho: in bếp/bill khi mất mạng internet (Toast: local hub, D4), mở két, và in theo trạm. Lý do: trình duyệt đơn thuần không có quyền raw USB ổn định, cần user gesture, và HTTPS/mixed-content chặn request tới máy in HTTP trong LAN.
- [SL] Có thể không cần native app nếu: chỉ in qua máy in mạng hỗ trợ HTTPS/WEBPRNT, chấp nhận mất in khi mất mạng internet. Đây là đánh đổi lớn, không khuyến nghị cho F&B đông khách.
- [SL] Thứ tự ưu tiên: (1) một **agent cục bộ** (service nhỏ trên máy quầy/LAN) nhận lệnh in từ POS web, gửi ESC/POS tới máy in qua LAN/USB, điều khiển két; (2) IoT box nếu không muốn cài máy tính; (3) chỉ dùng WebUSB/WebBluetooth cho máy in di động.
- [SL] Trạng thái in phải có hàng đợi bền (ghi trước khi gửi), vì máy in nhiệt không báo lại đã in hay chưa (ESC/POS).

## Khoảng trống — thứ không tìm được nguồn
- Văn bản gốc NĐ 254/2026, TT 91/2026: không đọc được (thuvienphapluat, vbpl, EY PDF mã hóa, Crowe 403). Mọi điều khoản HĐ ở trên là **thứ cấp** → cần đối chiếu công báo trước khi cam kết.
- Ngày hiệu lực NĐ 254: 30/06 hay 01/07/2026 chưa thống nhất.
- Thời điểm lập HĐ bán lẻ, quy định "không kết nối được CQT", ngày chốt cuối ngày theo lịch hay theo ca: không có.
- Hộ khoán và bỏ thuế khoán 2026: không tìm được văn bản xác nhận.
- Đặc tả NAPAS VietQR (sub-ID field, giới hạn ký tự nội dung), API tạo QR vietqr.io (404), webhook SePay (header, retry, khớp mã), PayOS (developer.payos.vn không truy cập được; thuật toán checksum chưa xác minh), Casso: chưa có.
- API chi tiết từng nhà cung cấp HĐ (VNPT, Viettel S-Invoice, MISA, BKAV, EasyInvoice): chưa đọc.
- GrabFood: có endpoint nhưng không xác nhận cơ chế nhận đơn mới (webhook hay poll), điều kiện đối tác VN, hoa hồng VN. ShopeeFood VN: không có API công khai; hoa hồng 20–25% từ nguồn Sapo, chưa đối chiếu nguồn chính. Be: không có gì đáng tin.
- Offline: thời gian/số đơn tối đa, cách đánh số, xung đột của Toast/Loyverse/Odoo chưa có; KiotViet/CukCuk/iPOS chưa xác nhận có offline không.
- Ví MoMo/ZaloPay/VNPay, POS thẻ tích hợp hay rời ở VN: không khảo sát.
- In: Epson ePOS SDK chi tiết (trang cũ đóng), Star StarXpand chi tiết, hệ gọi số, máy cân, màn hình phụ, máy in tem ly: không khảo sát.
- Nguồn đa số là blog nhà cung cấp phần mềm (Sapo, MISA, Klikit, Qashier) — thiên lệch quảng cáo. Ngân sách WebSearch/WebFetch đã gần hết; nhiều mục đọc ở mức snippet.

## Khác biệt giữa các loại quán — chỗ cafe/trà sữa/quán ăn/bar/bakery làm KHÁC nhau thật sự
- **Hóa đơn (D1)**: KHÔNG khác. Cafe, trà sữa, quán ăn, bar (ăn uống) và tiệm bánh (bán lẻ trực tiếp) đều thuộc nhóm bắt buộc HĐ từ MTT theo ngành, bất kể doanh thu [TL thứ cấp]. Khác loại quán không đổi nghĩa vụ → không tách logic HĐ theo loại quán.
- **Thanh toán/QR (D2)** [SL]: cafe/trà sữa chủ yếu QR động, đơn nhỏ, khách tự quét. Bar/nhà hàng: nhiều người trả chung một bàn/tab → cần thanh toán nhiều phần, chia bill (đã có trong mô hình). Tiệm bánh: đặt trước + trả trước/cọc → PaymentIntent cần tồn tại trước khi có đơn chốt.
- **Giao hàng (D3)** [SL]: trà sữa và cafe có tỷ trọng giao hàng cao, dễ 86 món theo kênh; quán ăn có giao hàng + bàn; bar hầu như không; tiệm bánh đặt giao theo lịch.
- **Offline (D4)** [SL]: quán ăn/bar phụ thuộc bếp + bàn → cần local hub (bếp in được khi mất mạng). Cafe/trà sữa đơn ngắn, tuyến bán lẻ → offline thẻ/QR + hàng đợi sync là đủ.
- **In ấn (D5)** [SL]: cafe/trà sữa cần máy in tem dán ly + in order ngắn; quán ăn cần in theo trạm bếp/bar; bar cần hệ gọi số/thẻ rung ít khi (KHÔNG TÌM THẤY nguồn); tiệm bánh cần máy in nhãn/hạn dùng.

## Tác động lên mô hình — chỗ nào mô hình dự kiến thiếu/sai, đề xuất thực thể/trường/cờ cấu hình cụ thể

**Thiếu (thêm):**
1. `EInvoiceProfile` (theo cửa hàng/chi nhánh): đối tượng HĐ (bắt buộc/tự nguyện), MST hộ/doanh nghiệp, nhà cung cấp HĐ, `regime_version` (NĐ 70 / NĐ 254 — cắt theo ngày áp dụng, không hardcode 30/06 hay 01/07).
2. `Invoice` (1 bill → 1 HĐ, lập từng lần bán): ký hiệu mẫu (có chữ M), số HĐ, mã CQT, `submit_status`, `submitted_batch_id`; và `InvoiceSubmissionBatch` (cuối ngày). Bill MTT bất biến; trả hàng = `Reversal` có liên kết, không sửa HĐ gốc (xác nhận kế toán thuế).
3. `Order.buyer_info` (tùy chọn, chỉ khi khách yêu cầu): tên, MST, CCCD/định danh, SĐT. Mặc định rỗng.
4. `PaymentIntent` (QR động: order_id, amount, content_code, status: pending/paid/partial/overpaid/expired) tách khỏi `Payment` (đã thu thực tế).
5. `BankTransaction` (webhook thô: gateway, reference_code, content, amount, transfer_type, received_at) với **unique(gateway, reference_code)** làm idempotency; `PaymentMatch` (nối vào PaymentIntent, gán tay được).
6. `SalesChannel` (dine_in / takeaway / delivery:grab / delivery:shopee / delivery:be) + `ChannelOrder` (external_order_id unique theo kênh, trạng thái kênh, fee_amount) + `ChannelMenuPrice` (giá theo kênh, cờ bật/tắt theo kênh).
7. `Device` (đăng ký thiết bị, `order_number_prefix`/dải số riêng) + `SyncEvent` (append-only: sự kiện bán, sự kiện kho, sự kiện thanh toán; có `conflict_state`).
8. `PrintJob` (station: bill/bếp/bar/tem/két; status; retries; ghi trước khi gửi) + `PrinterDevice` (kiểu: escpos_lan / webprnt / iot / agent; có drawer_kick).
9. `Shift` + `business_date` (tách khỏi `created_at`), mỗi đơn gắn business_date; đối soát cuối ca so tổng: tiền mặt + QR khớp + thẻ + kênh (fee).

**Cờ cấu hình (công tắc, không hardcode):**
- `einvoice.enabled`, `einvoice.regime_version`, `einvoice.submit_cutoff` (cuối ngày theo giờ nào — KHÔNG TÌM THẤY văn bản, phải xác nhận).
- `offline.card_enabled`, `offline.max_hours` (Square: 24h, tối đa 72h là tham chiếu), `offline.allow_refund` (mặc định tắt — Loyverse không cho).
- `inventory.deduct_at` (order_placed | item_ready | payment | ...), `inventory.allow_negative`.
- `channel.<key>.commission_pct` (Shopee tham chiếu 20–25%, chưa xác nhận).
- `print.kitchen_station_map`, `print.drawer_on_cash`.
- `payment.qr_static_fallback` (QR tĩnh khi không có webhook).

**Sai/chưa khớp:**
- "Một `Payment` = một lần thanh toán thực": cần tách intent (yêu cầu thu) và giao dịch ngân hàng (BankTransaction) — hiện mô hình chỉ có một.
- "Hủy món là sự kiện có lý do + duyệt" và "trả hàng" có thể mâu thuẫn với "HĐ MTT bất biến": hủy món trước khi lập HĐ (chưa thanh toán) vs hoàn tiền sau khi có HĐ — hai đường riêng, không dùng chung một trạng thái.
- "Ngày kinh doanh" cần khớp với báo cáo CQT (lịch hay ca?) — chưa có nguồn, ghi là câu hỏi mở.
- "Khuyến mãi tách khỏi tích điểm" đúng hướng: Toast ghi rõ loyalty và gift card không chạy offline → 2 cơ chế, 2 cờ.
- Đơn kênh giao hàng: phải có đường nhận đơn không qua POS đang mở (webhook/cloud) — không thể chỉ có LAN.

## Câu hỏi mở (cần người có kinh nghiệm kế toán thuế / đối tác)
1. NĐ 254/2026 Điều 15: "cuối ngày" là lịch (0h–24h) hay ca? Có thời hạn tuyệt đối không?
2. Trả hàng sau khi đã có HĐ MTT: có được lập HĐ điều chỉnh không, hay chỉ ghi sổ?
3. Hộ khoán: ngưỡng 100 triệu không bắt buộc HĐ có còn sau NĐ 254 không?
4. Grab/ShopeeFood VN: điều kiện đối tác, phí, và có ai đã tích hợp trực tiếp không?
5. Đặc tả VietQR: giới hạn nội dung chuyển khoản và sub-ID field.
