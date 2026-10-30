---
title: Phiếu in — bill, phiếu pha chế, tem ly, tạm tính, phiếu hủy, phiếu hoàn, phiếu chốt ca
audience:
  - thu-ngan
  - pha-che
  - quan-ly
  - van-hanh
screens:
  - table-slips
  - refund-and-close-slips
decisions:
  - D-138
  - D-042
  - D-045
  - D-056
  - D-063
  - D-106
  - D-114
  - D-115
  - D-097
  - D-131
  - D-082
  - D-083
tests:
  - apps/pos/src/features/printing/kitchen-routing-and-cup-label-switches.test.ts
  - apps/pos/src/features/printing/print-sale-slips.test.ts
  - apps/pos/test/browser/slips-read-whole-in-chrome.test.ts
  - packages/printing/src/layout/lay-out-document.test.ts
  - packages/printing/src/templates/bill-template.test.ts
  - packages/printing/src/templates/kitchen-ticket-template.test.ts
  - packages/domain/src/kitchen/diff-kitchen-ticket-combo.test.ts
  - apps/pos/src/features/order/combo-cart-line.test.ts
  - apps/pos/src/features/order/typed-and-weighed-lines.test.ts
  - apps/pos/src/app/table-rounds.test.tsx
  - apps/pos/src/app/table-void-after-sent.test.tsx
  - apps/pos/src/app/close-shift-with-count.test.tsx
  - apps/pos/src/app/refund-from-history.test.tsx
  - apps/pos/src/app/sale-invoice-reprint.test.tsx
  - e2e/pos/table-service.spec.ts
  - apps/pos/src/app/table-kitchen-lock-without-a-printer.test.tsx
  - apps/pos/src/app/close-shift-slip-follows-the-server.test.tsx
---

# Phiếu in

## Dùng để làm gì

Máy quầy làm ra các phiếu sau, mỗi phiếu đúng lúc cần:

| Phiếu | Khi nào | Cho ai |
|---|---|---|
| **Phiếu pha chế** (một phiếu cho mỗi trạm: quầy pha chế, bếp…) | thanh toán đơn quầy; mỗi lần **Gửi bếp** ở bàn (chỉ món mới) | pha chế / bếp |
| **Tem dán ly** (một tem cho mỗi ly, ghi topping, ghi chú) | thanh toán đơn **quầy** (đơn bàn hiện không có tem — xem Luật) | dán lên ly |
| **Hóa đơn** (bill) | thanh toán xong; in lại từ Lịch sử đơn | khách |
| **Phiếu tạm tính** (đầu phiếu "PHIẾU TẠM TÍNH") | **In tạm tính** ở bàn | khách xem trước khi trả |
| **Phiếu hủy món** | hủy món đã gửi bếp | trạm đã làm món đó |
| **Phiếu hoàn tiền** (đầu phiếu "PHIẾU HOÀN TIỀN") | hoàn tiền xong | khách / lưu két |
| **Phiếu chốt ca** | đóng ca xong | lưu két, nộp quản lý |

## Ai dùng, cần quyền gì

Phiếu tự ra theo thao tác; không cần quyền riêng. In lại hóa đơn: ai đứng quầy cũng làm được.

## Các bước

### Hiện tại: phiếu là bản xem trước trên màn

**Bản máy quầy đang chạy (trong trình duyệt) chưa nối máy in.** Mọi phiếu hiện trên màn, mỗi phiếu có dòng:

> Bản xem trước — máy này chưa nối máy in, phiếu chưa được in.

(Dù chưa in thật, **phiếu bếp ở bàn đã tính là gửi bếp**: xem mục "Khi nào món thành Đã gửi bếp" bên dưới.)

Thu ngân đọc phiếu trên màn (hoặc xoay màn cho pha chế xem). Tem ly hiện **không dấu** (đúng như máy in tem sẽ in); các phiếu khác hiện đầy đủ tiếng Việt. Phiếu giữ đúng cột như trên giấy 80 mm, nên ô phiếu hẹp hơn tờ giấy thì cột số tiền bên phải bị khuất: **kéo ngang trong ô phiếu** để xem hết.

1. **Sau khi thanh toán đơn quầy**: màn **Đã thanh toán** xếp các phiếu: phiếu pha chế, tem dán ly, hóa đơn (xem ảnh ở [04-thanh-toan.md](04-thanh-toan.md)).
2. **Ở bàn**: bấm **Gửi bếp** hoặc **In tạm tính** ⇒ màn phiếu mở ra (**Phiếu bếp vừa gửi** / **Phiếu tạm tính**); bấm **Quay lại đơn**.

   ![Phiếu bếp và phiếu tạm tính của bàn T02](../images/may-quay/table-slips.webp)

3. **Hoàn tiền**: màn **Đã hoàn tiền** hiện phiếu hoàn tiền; bấm **Về lịch sử đơn**.

   ![Phiếu hoàn tiền](../images/may-quay/refund-and-close-slips.webp)

4. **Đóng ca**: màn **Đã đóng ca** hiện phiếu chốt ca (có mạng: in theo số **máy chủ** đã ghi; mất mạng hoặc máy chủ chậm quá 10 giây: in bản **"PHIẾU ĐÓNG CA (TẠM — chưa đối chiếu máy chủ)"** theo số trên máy, rồi nút **In bản chính thức** khi máy chủ nhận ca — xem [07](07-thu-chi-va-dong-ca.md)) (tiền hệ thống, tiền thực tế, chênh lệch, chỗ ký nhận); bấm **Mở ca mới**.

   ![Phiếu chốt ca](../images/may-quay/close-shift-slip.webp)

5. **In lại hóa đơn**: Lịch sử đơn → đơn đã trả → **In lại hóa đơn số …** (xem [08-lich-su-don.md](08-lich-su-don.md)). Đơn đã có hóa đơn điện tử: **In lại bill kèm mã tra cứu** ở màn Đã thanh toán.

### Khi có máy in (ứng dụng cài — sắp có)

Mỗi phiếu ghi một trong ba trạng thái: **Đang in…**, **Đã in**, hoặc **In lỗi (mã lỗi) — phiếu chưa ra giấy.** Máy ghi lại kết quả mỗi lần in lên máy chủ (để tra "phiếu đã ra giấy chưa").

## Luật và giới hạn

- **Phiếu pha chế chia theo trạm** của món (trạm đặt ở trang quản lý) khi công tắc **Chia phiếu theo trạm pha chế/bếp** bật. **Tắt** thì **một phiếu chung** (tiêu đề "Phiếu chung") gồm mọi món có trạm, in ở máy in của trạm đầu tiên theo tên của chi nhánh. Mỗi lượt gửi bếp ở bàn chỉ in **phần mới**.
- **Combo**: mỗi món trong combo in ở **trạm của chính món đó** — phiếu bar ghi "1 x Combo sáng / + Trà sữa trân châu (L) / + 50% đường" (tùy chọn của món thụt vào thêm một nấc), phiếu bếp ghi cùng combo với "+ Bánh croissant"; món không có trạm in ở trạm của combo. Combo chỉ thành "Đã gửi bếp" khi **mọi** phiếu có combo đó đều đã in; một phiếu kẹt thì lần gửi sau in lại combo ở mọi trạm của nó (trạm đã nhận có thể nhận trùng). Phiếu hủy combo in ở mọi trạm đã làm một phần của combo.
- **Bill** của combo: dòng combo với giá combo, dưới đó từng món (món có phụ thu ghi số tiền phụ thu) và tùy chọn của món thụt vào thêm một nấc.
- **Khi nào món thành "Đã gửi bếp":**
  - **Máy có máy in bếp**: khi máy in nhận phiếu. Máy in kẹt giấy hoặc báo lỗi thì món **vẫn "Chưa gửi bếp"**, phiếu vào danh sách "Phiếu in lỗi" và lần gửi sau in lại.
  - **Máy không có máy in bếp** (bản trong trình duyệt, phiếu chỉ xem trên màn): phiếu hiện ra là món **thành "Đã gửi bếp"**, giống luật của phiếu tạm tính. Người xem phiếu trên màn coi như đã báo bếp, nên món bị khóa: muốn bớt phải **Hủy món** (xin quản lý duyệt, ra **phiếu hủy**), muốn hủy cả đơn thì phải hủy các món đã gửi trước rồi xin quyền hủy đơn.
  - Đơn quầy trả tiền xong: phiếu bếp hiện cùng màn đã thanh toán, đơn đã đóng nên việc đánh dấu không đổi gì thêm.
- **Số gọi** trên phiếu bếp, tem ly, hóa đơn theo luật số gọi ở [03-ban-tai-quay.md](03-ban-tai-quay.md): một máy 1–99, từ hai máy bán trở lên có số thứ tự máy ở hàng trăm (201, 202…).
- **Phiếu tạm tính**: in hoặc chỉ xem trên màn đều tính là khách đã được đưa phiếu (bàn sang "Đã in tạm tính"); máy in kẹt thì không tính.
- **Tem dán ly**: một tem cho **mỗi ly** (ghi "1/4", "2/4"…), chỉ cho món được đánh dấu "in tem ly" ở trang quản lý — kể cả **ly nằm trong combo** (tem ghi tên đồ uống, tùy chọn của nó và ghi chú của combo) — và **chỉ khi công tắc In tem ly bật** (tắt thì không in tem nào). Đơn quầy in tem lúc thanh toán; đơn bàn in tem **lúc gửi bếp**, cho phần vừa gửi (lượt sau chỉ tem cho món mới, lúc thanh toán không in lại). Tem chỉ ghi tùy chọn, không ghi giảm giá của món.
- Khổ giấy đang dùng để dựng phiếu: bill **80 mm**, tem ly **40 × 30 mm**. Khi in thật, chữ được in **không dấu** cho tới khi cài được bảng mã tiếng Việt của từng máy in (bảng mã sai thì mọi chữ có dấu thành ký tự lạ).
- **Tên món dài tự xuống dòng; số tiền luôn nằm cùng dòng đầu của tên.** Tên hoặc ghi chú có dấu xuống dòng ở đầu (thường do dán từ Excel) không còn đẩy số tiền lên một dòng trống phía trên tên.
- Thông tin người mua hóa đơn điện tử **không in** lên bill.
- Món **bán theo cân** in **số gam** thay cho số lượng: bill ghi "351 g x 32.000 ₫/100 g" rồi số tiền (giấy 58 mm hẹp thì "351 g" cùng dòng số tiền, "x 32.000 ₫/100 g" xuống dòng dưới); phiếu pha chế ghi "351 g x Cà phê hạt Robusta". Món **giá nhập tay** in như món thường, với giá đã gõ: "2 x 180.000 ₫".

## Khi có lỗi

| Máy báo | Nghĩa là | Làm gì |
|---|---|---|
| Bản xem trước — máy này chưa nối máy in, phiếu chưa được in. | Bản web, không có máy in | Đọc phiếu trên màn |
| In lỗi (…) — phiếu chưa ra giấy. | Máy in không nhận (hết giấy, kẹt, mất kết nối) | Kiểm tra máy in; gửi bếp lại / in lại |
| Không có món nào cần gửi bếp. | Gửi bếp khi không còn món mới | — |
| Phiếu hủy đã in nhưng máy chưa báo được máy chủ: khi có mạng, lần gửi bếp sau có thể in lại phiếu hủy này. | Hủy món khi mất mạng | Báo bếp bỏ qua phiếu hủy in trùng |

### Bản xem trước phải đọc được hết

Khi máy chưa nối máy in, mỗi phiếu hiện **bản xem trước** trên màn: tờ giấy trắng chữ đen, đúng các cột như giấy in ra (bill, phiếu pha chế, tem ly, tạm tính, phiếu hủy món, phiếu hoàn, phiếu chốt ca tạm và chính thức). Tờ giấy **không bao giờ bị cắt cột bên phải** (số tiền, ngày): thẻ chứa phiếu giãn theo màn (một phiếu thì rộng hết cỡ, nhiều phiếu thì chia cột), và nếu thẻ vẫn hẹp hơn tờ giấy (điện thoại, nhiều phiếu cạnh nhau) thì **chữ thu nhỏ đúng tỉ lệ** cho vừa, tối thiểu 7 px, thay vì phải cuộn ngang. Kiểm ở 360, 768, 1280 và 1920 px.

## Mất mạng thì sao

Phiếu dựng ngay trên máy từ dữ liệu của máy, không cần mạng. (Khi có máy in nối vào máy quầy, in vẫn chạy khi mất mạng.)

## Chưa làm / sắp có

- **In ra giấy**: cần ứng dụng cài trên máy quầy (Windows, Android) để gửi phiếu tới máy in nhiệt ESC/POS và máy in tem; mở két qua máy in. Trang web không in thẳng ổn định được ra máy in trong mạng quán.
- Cài máy in theo từng máy quầy (khổ giấy, bảng mã tiếng Việt).
- Hàng đợi in có thử lại tự động.
- Tem ly của món đã gửi bếp rồi mà phiếu in hỏng không in lại tự động (như tem ly đơn quầy).
- Màn hình bếp (KDS) thay cho phiếu giấy.
