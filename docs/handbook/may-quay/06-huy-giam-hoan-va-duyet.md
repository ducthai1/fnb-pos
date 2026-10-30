---
title: Hủy món, giảm giá, hủy đơn, hoàn tiền và quản lý duyệt tại chỗ
audience:
  - thu-ngan
  - quan-ly
  - chu-quan
screens:
  - approval-sheet
  - sale-adjusted
  - void-line
  - discount
  - cancel-order
  - refund
decisions:
  - D-115
  - D-028
  - D-029
  - D-031
  - D-036
  - D-040
  - D-052
  - D-057
  - D-061
  - D-063
  - D-076
  - D-081
  - D-105
  - D-108
  - D-109
  - D-111
  - D-097
  - D-131
  - D-132
  - D-133
tests:
  - apps/pos/src/app/counter-void-and-cancel.test.tsx
  - apps/pos/src/app/counter-discount-with-approval.test.tsx
  - apps/pos/src/app/table-void-after-sent.test.tsx
  - apps/pos/src/app/table-cancel-needs-a-manager.test.tsx
  - apps/pos/src/app/refund-from-history.test.tsx
  - apps/pos/src/app/table-refusals.test.tsx
  - apps/pos/src/screens/order-adjust/other-reason-needs-a-note.test.tsx
  - apps/api/test/integration/sync/other-reason-needs-a-note.test.ts
  - packages/contracts/src/sync/commands/void-discount-refund-payload-schemas.test.ts
  - apps/pos/src/app/cash-move-with-approval.test.tsx
  - apps/pos/src/screens/approval/approval-sheet.test.tsx
  - apps/pos/src/features/permissions/till-authority.test.ts
  - apps/pos/src/messages/approval-refusal-sentences.test.ts
  - apps/pos/src/messages/order-adjust-sentences.test.ts
  - packages/domain/src/permissions/authorize-cumulative-limits.test.ts
  - packages/domain/src/permissions/role-templates.test.ts
  - packages/domain/src/permissions/approval-coverage.test.ts
  - apps/api/test/integration/auth/on-the-spot-approval-refuses-bad-requests.test.ts
  - apps/api/test/integration/auth/on-the-spot-approval.test.ts
  - apps/api/test/integration/auth/manager-approval-is-logged.test.ts
  - apps/api/test/integration/sync/sync-apply-discount-judges-the-cumulative-rate.test.ts
  - apps/api/test/integration/sync/sync-approval-is-timed-by-the-server.test.ts
  - apps/api/test/integration/sync/sync-approval-is-used-once-by-whoever-asked.test.ts
  - apps/api/test/integration/sync/sync-save-draft-open-price-needs-the-permission.test.ts
  - apps/api/test/integration/sync/sync-void-line-takes-unsent-units-first.test.ts
  - apps/api/test/integration/sync/cancel-shown-or-served-draft-needs-a-manager.test.ts
  - apps/api/test/integration/sync/sync-refund-gives-back-what-the-sale-took.test.ts
  - apps/api/test/integration/shift/cash-refund-is-paid-out-of-the-shift-drawer.test.ts
  - e2e/pos/void-discount-refund-with-approval.spec.ts
  - apps/pos/src/app/table-kitchen-lock-without-a-printer.test.tsx
  - apps/pos/src/app/table-void-weighed-after-sent.test.tsx
---

# Hủy món, giảm giá, hủy đơn, hoàn tiền và duyệt tại chỗ

## Dùng để làm gì

Những thao tác làm **bớt tiền** của quán đều đi qua một luồng chung: máy xem người đang đứng quầy có được tự làm không; nếu vượt quyền, một người có quyền (thường là quản lý) **chọn tên mình và nhập PIN ngay trên máy** để cho phép **đúng một lần** thao tác đó, **cho đúng đơn (hoặc ca) và đúng con số** hiện trên màn duyệt. Mọi lần duyệt được ghi nhật ký (ai xin, ai duyệt, duyệt cái gì, cho đơn/ca nào).

| Thao tác | Khi nào dùng | Ở đâu |
|---|---|---|
| **Xóa món** / nút − | món **chưa gửi bếp**, chưa giảm giá | nút ⋯ của món |
| **Hủy món** | món đã gửi bếp (bếp đã làm hoặc đang làm) | nút ⋯ của món |
| **Giảm giá** món | giảm cho một món | nút ⋯ của món |
| **Giảm giá đơn** | giảm cho cả đơn | dưới tổng tiền |
| **Hủy đơn** | khách không mua nữa, đơn chưa trả | dưới tổng tiền |
| **Hoàn tiền** | đơn **đã trả**, khách trả lại món | Lịch sử đơn → đơn đã trả |

![Đơn sau khi giảm 10% món trà sữa, hủy 1 cà phê muối và giảm 5.000 đ toàn đơn](../images/may-quay/sale-adjusted.webp)

## Ai dùng, cần quyền gì

Quyền nằm ở **vai trò** của nhân viên (chủ quán sửa ở trang quản lý). Vai trò mẫu khi tạo quán:

| Quyền | Thu ngân | Quản lý ca | Chủ quán |
|---|---|---|---|
| Giảm giá món (`line_discount`) | tự làm tới **10%** mỗi món | không giới hạn | không giới hạn |
| Giảm giá đơn (`order_discount`) | phải xin duyệt | không giới hạn | không giới hạn |
| Hủy món đã gửi bếp (`void_after_sent`) | phải xin duyệt | có | có |
| Hủy đơn đã in tạm tính / đã gửi bếp (`close_unpaid_table`) | phải xin duyệt | có | có |
| Hoàn tiền (`refund`) | phải xin duyệt | có | có |
| Thu/chi két (`cash_move`) | tự làm tới **500.000 đ** cộng dồn trong ca | không giới hạn | không giới hạn |
| Bán món giá nhập tay (`open_price`) | có | có | có |
| Chuyển bàn (`transfer_table`) | có | có | có |
| Chấp nhận lệch két khi đóng ca (`accept_close_difference`) | phải xin duyệt | có | có |

Pha chế không có quyền nào trong số này. Các quyền quản trị (sửa thực đơn, nhân viên, thiết bị, cài đặt, xem báo cáo) **không duyệt hộ được**: người có quyền phải tự làm ở trang quản lý.

## Các bước

### Duyệt tại chỗ (chung cho mọi thao tác)

1. Thu ngân làm thao tác như bình thường. Nếu vượt quyền, máy thay màn hiện tại bằng màn **Cần quản lý duyệt**, ghi rõ đang xin duyệt gì, ví dụ "Giảm 20% món Trà sữa trân châu".

   ![Cần quản lý duyệt](../images/may-quay/approval-sheet.webp)

2. Ở mục **Ai duyệt?**, người duyệt chạm vào tên mình, nhập PIN, bấm **Duyệt**. Chạm **Chọn người khác** nếu nhầm người.
3. Duyệt xong, thao tác được ghi luôn. Bấm **Không làm nữa** để bỏ — máy không ghi gì.

### Bớt / xóa món chưa gửi bếp

Nút **−** bên cạnh món, hoặc **⋯** → **Xóa món**. Không cần lý do, không cần duyệt.

### Hủy món (đã gửi bếp)

1. Bấm **⋯** của món → **Hủy món**. Màn ghi số còn trên đơn và số đã gửi bếp, ví dụ **Còn 1 trên đơn · 1 đã gửi bếp**.

   ![Hủy món](../images/may-quay/void-line.webp)

2. Chọn **Số lượng hủy** và **Lý do**: *Khách đổi ý · Nhập nhầm món · Pha/làm sai món · Hết nguyên liệu · Lý do khác*. Chọn **Lý do khác** thì máy mở ô **Ghi chú lý do**: ghi vài chữ chuyện gì đã xảy ra (1–120 ký tự) — chưa ghi thì nút hủy chưa bấm được.
3. Bấm **Hủy 1 món**. Phần **chưa gửi bếp** được hủy trước; phần đã gửi bếp cần duyệt (nếu chi nhánh bật) và in **phiếu hủy** cho trạm đã làm món đó.
4. Trên đơn, món bị hủy hiện thêm dòng "Đã hủy 1 (đã gửi bếp)".
5. **Máy chưa có máy in bếp** (bản trong trình duyệt): món vẫn thành "Đã gửi bếp" ngay khi phiếu bếp hiện trên màn, nên hủy món bếp đã nhận **luôn phải xin duyệt và ra phiếu hủy** như trên.

**Món bán theo cân đã gửi bếp:** màn **Hủy món** không có ô **Số lượng hủy** (một lần cân là một món, không hủy một phần). Màn ghi "Còn lần cân 351 g trên đơn · Lần cân 351 g đã gửi bếp", nút ghi **Hủy lần cân 351 g**; xin duyệt ghi "Hủy lần cân 351 g Cà phê hạt Robusta đã gửi bếp", phiếu hủy ghi "HỦY 351 g x …", dòng trên đơn ghi "Đã hủy lần cân 351 g (đã gửi bếp)". Muốn cân lại thì hủy lần cân rồi chọn món để cân lần mới.

### Giảm giá món hoặc giảm giá đơn

1. Món: **⋯** → **Giảm giá**. Cả đơn: nút **Giảm giá đơn**.
2. Chọn **Theo %** (nút nhanh **5% · 10% · 15% · 20% · 30% · 50%**, hoặc gõ) hoặc **Số tiền** (đồng).
3. Máy xem trước "Giảm 20.000 ₫ · còn phải trả 157.000 ₫". Bấm **Áp dụng giảm giá**.

   ![Giảm giá món](../images/may-quay/discount.webp)

4. Bấm **Gỡ giảm giá** để bỏ — gỡ không cần duyệt.

### Hủy đơn (chưa trả)

1. Bấm **Hủy đơn** dưới tổng tiền. Màn ghi "Đơn hủy không thu tiền và không in gì thêm. Món đã gửi bếp phải hủy món (có phiếu hủy) trước."

   ![Hủy đơn](../images/may-quay/cancel-order.webp)

2. Chọn **Lý do**: *Khách không mua nữa · Đơn bị trùng · Đơn thử · Lý do khác* (**Lý do khác** cần **Ghi chú lý do**, như khi hủy món). Bấm **Hủy đơn này**.
3. Đơn chưa từng in tạm tính, chưa từng gửi bếp: thu ngân tự hủy. Đơn **đã in tạm tính** hoặc **đã gửi bếp**: cần duyệt (chặn kiểu "in tạm tính → thu tiền khách → hủy đơn"). Đơn còn món đã gửi bếp chưa hủy thì máy từ chối: hủy từng món đó (có phiếu hủy) trước; hủy hết rồi mới hủy được đơn (vẫn cần duyệt vì bếp đã nhận món).
4. **Bàn không còn món nào:** đơn bàn đã lưu rồi bị xóa hết món vẫn giữ bàn "có khách". Màn bàn hiện nút **Trả bàn** (chỉ khi đơn trống): bấm **Trả bàn** ở màn xác nhận là đóng đơn trống (lý do "Bàn không còn món nào", không phải chọn lý do), bàn trống lại và máy báo "Đã trả bàn 1.". Đơn đã in tạm tính hoặc đã từng gửi bếp thì vẫn phải có quản lý duyệt như hủy đơn.

### Hoàn tiền đơn đã trả

1. **Lịch sử đơn** → chọn đơn đã trả → **Hoàn tiền đơn số …** (xem [08-lich-su-don.md](08-lich-su-don.md)).
2. Chọn số lượng hoàn của từng món (mỗi món ghi **Đã bán 2 · còn hoàn được 2**). Máy tính **số tiền hoàn theo đúng giá đã bán** (đã trừ giảm giá) — thu ngân không gõ số tiền.
3. Chọn **Hoàn bằng**: **Tiền mặt từ két** (két của ca đang mở giảm đúng số này) hoặc **Chuyển khoản** (máy chỉ ghi lại; thu ngân tự chuyển từ tài khoản cửa hàng; két không đổi). Nút **Chuyển khoản** chỉ có khi khách đã trả đơn đó bằng **chuyển khoản QR**; đơn trả toàn tiền mặt chỉ hoàn bằng tiền mặt.
4. Chọn **Lý do**: *Khách trả lại món · Pha/làm sai món · Món không đạt · Tính tiền nhầm · Lý do khác* (**Lý do khác** cần **Ghi chú lý do**). Bấm **Hoàn 50.000 ₫**.

   ![Hoàn tiền](../images/may-quay/refund.webp)

5. Máy in phiếu hoàn tiền (xem [10-phieu-in.md](10-phieu-in.md)).

## Luật và giới hạn

- **Combo** hủy và trả hàng theo **nguyên combo** (chọn số combo); các món bên trong và tùy chọn của chúng đi theo, không hủy riêng một món trong combo. Phiếu hủy in ở mọi trạm đã làm một phần của combo.
- **Ngưỡng tính cộng dồn**, không tính từng lần:
  - Giảm giá: so **tổng phần trăm mọi giảm giá cùng loại** trên món đó (hoặc trên đơn) **sau khi** thêm lần này, **làm tròn lên**. Ví dụ thu ngân giới hạn 10% đã giảm 10% cho một ly, giảm thêm 5% nữa là 15% ⇒ phải xin duyệt; màn duyệt ghi "(tổng giảm sau lần này: 15%)".
  - Thu/chi két: so **tổng số tiền đã thu và đã chi khỏi két trong cả ca** (mọi nhân viên trên két đó cộng chung, lấy độ lớn — rút 400.000 rồi bỏ lại 400.000 là 800.000 đ). Màn duyệt ghi "(két đã thu và chi trong ca, kể cả lần này: …)".
- **Duyệt dùng một lần**, cho đúng thao tác, **đúng chỗ** và **đúng con số** quản lý đã thấy trên màn duyệt:
  - Đúng chỗ: giảm giá món, hủy món đã gửi bếp và giá nhập tay gắn với **món đó của đơn đó**; giảm giá đơn, hủy đơn đã in tạm tính / đã gửi bếp, hoàn tiền, chuyển bàn gắn với **đơn đó**; thu/chi két, chấp nhận lệch két gắn với **ca đó**. Duyệt "Hoàn 25.000 ₫ cho đơn số 12" không dùng được cho đơn khác, kể cả trong 10 phút.
  - Đúng con số: giá nhập tay đúng **giá đã gõ** (duyệt 150.000 ₫ không dùng cho 15.000 ₫, cũng không dùng cho món giá nhập tay thứ hai); hoàn tiền đúng **số tiền trả khách**; hủy món đã gửi bếp đúng **số món bếp đã có**; thu/chi két đúng **tổng thu + chi trong ca**; đóng ca đúng **số lệch**. Khác một đồng là phải xin lại.
  - Riêng giảm giá: duyệt là **tối đa** phần trăm đó cho món/đơn đó. Máy khác thêm món làm tổng giảm tụt từ 20% xuống 19% thì vẫn dùng được, không phải xin lại; cao hơn mức đã duyệt thì phải xin lại.
  - Máy quầy bản cũ xin duyệt mà không gửi đơn/ca thì máy chủ không nhận (xem bảng lỗi): cập nhật ứng dụng bán hàng.
- **Hạn duyệt**: thao tác phải được ghi trong **10 phút** sau khi duyệt (cho phép đồng hồ máy chậm 2 phút), và phải tới máy chủ trong **12 giờ** (máy mất mạng cả buổi vẫn giữ được lần duyệt, vì lần duyệt chỉ dùng được cho đúng việc đã duyệt).
- Quyền của người duyệt được kiểm **lúc duyệt**. Người duyệt bị đổi vai trò hay khóa ngay sau đó thì lần duyệt đã cho vẫn dùng được trong 10 phút: khách đã nhận tiền/giảm giá, từ chối lúc đó không lấy lại được gì.
- **Không tự duyệt cho mình**. Người duyệt phải có quyền tự làm thao tác đó; danh sách **Ai duyệt?** là mọi nhân viên đang hoạt động của chi nhánh trừ người xin, máy chủ quyết định ai đủ quyền.
- Hủy món đã gửi bếp **cần duyệt** theo cài đặt chi nhánh `void_after_sent_needs_approval` (mặc định **bật**). Tắt thì ai cũng hủy được món đã gửi bếp.
- Hủy món **không trả nguyên liệu về kho** (chưa có kho).
- Món đang giảm giá: gỡ giảm giá trước rồi mới hủy. Món đã hủy một phần: không giảm giá thêm.
- Đơn có **giảm giá toàn đơn**: các món đang có bị khóa sửa/xóa; hủy món làm phần giảm toàn đơn vượt mức được tự giảm thì máy chặn.
- **Hoàn về đúng đường khách đã trả**: hoàn bằng chuyển khoản chỉ khi đơn gốc có khoản **chuyển khoản QR**; đơn trả toàn tiền mặt mà máy gửi hoàn bằng chuyển khoản thì máy chủ từ chối.
- Hoàn tiền tạo một **đơn hoàn riêng** gắn với đơn gốc; số còn hoàn được trừ cả những lần hoàn trước. Hoàn **không nhập lại kho**. Chỉ hoàn được đơn **đã trả**.
- **Hoàn tiền luôn thuộc một ca**, như thanh toán: tiền hoàn ra khỏi két của ca đang mở và vào báo cáo của ca đó. Máy quầy chỉ mở được **Lịch sử đơn** sau khi đã mở ca, nên lần hoàn luôn ghi vào ca đang mở. Lệnh hoàn không nêu ca, tới từ máy không có ca nào đang mở (máy bản cũ), bị máy chủ từ chối; lần hoàn đã ghi trước đây giữ nguyên.
- **Lý do khác phải có ghi chú** khi hủy món, hủy đơn, hoàn tiền: 1–120 ký tự, bỏ khoảng trắng hai đầu (ghi toàn dấu cách là chưa ghi). Ghi chú lưu cùng lý do trên máy chủ (đơn bị hủy, đơn hoàn, bản ghi hủy món). Máy chủ từ chối lệnh "Lý do khác" không kèm ghi chú (máy quầy bản cũ). Các lý do có sẵn trong danh sách thì không cần ghi chú.
- Giảm theo % gõ được số lẻ tới 2 chữ số sau dấu phẩy (ví dụ `12,5`), từ trên 0 đến 100.

## Khi có lỗi

| Máy báo | Nghĩa là | Làm gì |
|---|---|---|
| Duyệt cần mạng: máy chưa kết nối được máy chủ. Kiểm tra mạng rồi thử lại, hoặc không làm thao tác này. | Mất mạng lúc xin duyệt | Chờ có mạng, hoặc người có quyền tự đăng nhập làm |
| Mã PIN không đúng. / Nhập sai PIN quá nhiều lần. Thử lại lúc … | PIN người duyệt sai / bị khóa | Nhập lại / chờ |
| Người này cũng không được tự làm thao tác này nên không duyệt được. Chọn người khác. | Người duyệt thiếu quyền | Chọn quản lý khác |
| Không tự duyệt cho mình được. Chọn người khác. | Chọn chính mình | Chọn người khác |
| Thao tác này không duyệt hộ được: người có quyền phải tự làm. | Quyền quản trị | Người có quyền tự làm |
| Bạn không có quyền làm thao tác này và không ai duyệt hộ được. | Không ai duyệt được | Báo chủ quán |
| Chi nhánh không có ai khác để duyệt. Thêm quản lý ở trang quản lý. | Chỉ có một nhân viên | Thêm quản lý |
| Phiên đứng quầy đã hết hạn. Nhập lại mã PIN để làm tiếp. | Phiên hết hạn giữa chừng | Nhập lại PIN |
| Lần duyệt đã quá hạn khi thao tác được ghi. / Lần duyệt này đã được dùng rồi … / Quản lý đã duyệt một con số khác với thao tác máy gửi … / Máy chủ không tìm thấy lần duyệt này. / Lần duyệt này dành cho người khác hoặc máy khác. (… Làm lại thao tác và nhờ quản lý duyệt lại.) | Lần duyệt không còn dùng được | Làm lại và xin duyệt lại |
| Máy chủ cần quản lý duyệt thao tác này mà lệnh không kèm lần duyệt nào. … | Máy chủ đòi duyệt | Làm lại, nhờ quản lý nhập PIN |
| Lần duyệt này dành cho đơn, món hoặc ca khác với thao tác máy gửi. Làm lại thao tác và nhờ quản lý duyệt lại. | Lần duyệt cho đơn/món/ca khác (hoặc cho từ trước khi duyệt gắn với đơn) | Làm lại và xin duyệt cho đúng đơn |
| Yêu cầu duyệt không nói rõ đơn hoặc ca nào nên máy chủ không nhận. Cập nhật ứng dụng bán hàng rồi làm lại thao tác. | Máy quầy bản cũ | Cập nhật ứng dụng, làm lại |
| Hủy món đã gửi bếp cần quản lý duyệt. | — | Xin duyệt |
| Chọn “Lý do khác” thì phải ghi vài chữ chuyện gì đã xảy ra. | Chọn Lý do khác mà ô ghi chú còn trống (nút xác nhận chưa bấm được) | Ghi chú lý do |
| Chọn “Lý do khác” mà không ghi chú nên máy chủ không nhận thao tác. Làm lại và ghi vài chữ chuyện gì đã xảy ra. | Lệnh "Lý do khác" không kèm ghi chú (máy quầy bản cũ) | Làm lại, ghi chú lý do |
| Số lượng hủy nhiều hơn số còn lại trên đơn. | Hủy quá số | Giảm số lượng hủy |
| Món đang được giảm giá: gỡ giảm giá của món trước rồi mới hủy. | — | Gỡ giảm giá |
| Hủy món làm phần giảm giá toàn đơn lớn hơn mức bạn được tự giảm. Gỡ giảm giá đơn trước, hủy món, rồi giảm lại. | — | Làm theo câu báo |
| Bếp đã có món của đơn này chưa được hủy. Hủy từng món đã gửi bếp (in phiếu hủy) trước, rồi mới hủy đơn. | Hủy đơn khi còn món đã gửi bếp | Hủy món trước |
| Nhập số: phần trăm từ 0,01 đến 100 (tối đa hai số lẻ), hoặc số tiền chỉ gồm chữ số. | Gõ sai mức giảm | Gõ lại |
| Mức giảm này làm tròn ra 0 ₫ trên số còn phải trả. | Mức quá nhỏ | Tăng mức giảm |
| Số tiền giảm lớn hơn số còn phải trả. / Nhập mức giảm lớn hơn 0. / Món đã hủy một phần nên không giảm giá thêm được. | — | Sửa mức giảm |
| Đơn này khách không trả bằng chuyển khoản nên chỉ hoàn được bằng tiền mặt từ két. | Hoàn bằng chuyển khoản cho đơn trả tiền mặt | Hoàn lại bằng tiền mặt từ két |
| Máy chưa mở ca nên lần hoàn tiền không được ghi. Mở ca, rồi hoàn lại đơn này từ Lịch sử đơn để két khớp sổ. | Lệnh hoàn không thuộc ca nào (máy bản cũ); hiện trong **Cần xử lý** dưới tên **Hoàn đơn** | Mở ca, vào **Lịch sử đơn**, hoàn lại đúng các món đó |
| Chọn ít nhất một món để hoàn. / Số lượng hoàn nhiều hơn số còn chưa hoàn của món. / Chỉ hoàn được đơn đã thanh toán. / Đơn này đã hoàn hết. | Hoàn sai | Chọn lại |
| Đơn chưa lưu xong trên máy (hoặc lần lưu vừa rồi lỗi). Quay lại đơn rồi thử lại. | Đơn đang lưu dở | Quay lại đơn, thử lại |

## Mất mạng thì sao

- Thao tác **trong quyền của mình** (xóa món chưa gửi, giảm giá trong ngưỡng, hủy đơn chưa in/chưa gửi) làm được khi mất mạng; máy gửi lên khi có mạng.
- **Xin duyệt cần mạng** (máy chủ kiểm PIN người duyệt). Mất mạng thì hoặc chờ, hoặc người có quyền tự đăng nhập trên máy làm thao tác đó (nếu họ đã đăng nhập từ trước khi mất mạng).
- Hủy món đã gửi bếp khi mất mạng: phiếu hủy vẫn hiện/in từ bản trên máy; máy báo "Phiếu hủy đã in nhưng máy chưa báo được máy chủ…" và ghi lại khi có mạng.

## Chưa làm / sắp có

- Chủ quán tự sửa danh sách lý do hủy/hoàn (hiện cố định, mỗi danh sách có "Lý do khác").
- Đổi giá món tại quầy (`price_override`), tặng món (`comp_item`), mở két không bán (`open_drawer`), mở lại đơn đã trả (`reopen_paid_order`): đã có quyền trong vai trò nhưng máy quầy chưa có nút.
- Hoàn tiền có nhập lại kho; hóa đơn điều chỉnh khi hoàn đơn đã xuất hóa đơn điện tử.
- Phiếu hủy ra giấy (hiện là bản xem trước — xem [10-phieu-in.md](10-phieu-in.md)).
