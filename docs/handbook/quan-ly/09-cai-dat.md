---
title: Cài đặt — công tắc tính năng, phí, tài khoản nhận tiền, ví điện tử, hóa đơn điện tử
audience: chu-quan
screens:
  - /settings
decisions:
  - D-030
  - D-047
  - D-049
  - D-055
  - D-061
  - D-078
  - D-098
  - D-096
  - D-138
tests:
  - apps/backoffice/src/components/settings/settings-switches.test.tsx
  - apps/backoffice/src/components/settings/settings-forms.test.tsx
  - apps/backoffice/src/components/settings/settings-groups.test.tsx
  - apps/backoffice/src/components/settings/wallet-account-section.test.tsx
  - apps/backoffice/src/lib/settings/flag-violation.test.ts
  - packages/feature-flags/src/validate-flag-constraints.test.ts
  - packages/feature-flags/src/resolve-inherited-config.test.ts
  - apps/api/test/integration/config/settings-routes-keep-flag-rules-and-access.test.ts
  - apps/api/test/integration/config/settings-routes-set-and-clear-values.test.ts
  - apps/api/test/integration/sync/happy-hour-prices-follow-the-switch.test.ts
  - apps/pos/src/features/printing/kitchen-routing-and-cup-label-switches.test.ts
  - packages/feature-flags/src/feature-flag-till-support.test.ts
  - apps/api/test/integration/config/config-layers-resolve-per-device.test.ts
  - apps/api/test/integration/config/config-changes-reach-the-tills-under-their-scope.test.ts
  - apps/api/test/integration/payments/payment-account-setting-reaches-tills.test.ts
  - apps/api/test/integration/payments/webhook-secret-is-sealed-and-set-by-managers.test.ts
  - apps/api/test/integration/payments/webhook-secret-belongs-to-one-branch.test.ts
  - apps/api/test/integration/payments/wallet-keys-are-sealed-and-set-by-managers.test.ts
  - apps/api/test/integration/einvoice/einvoice-profile-is-set-per-branch.test.ts
  - e2e/backoffice/settings-and-day-close.spec.ts
---

# Cài đặt — công tắc tính năng, phí, tài khoản nhận tiền, ví điện tử, hóa đơn điện tử

## Dùng để làm gì

Một trang cho mọi lựa chọn vận hành của quán: bật/tắt tính năng, cách tính tiền đơn (VAT, phí dịch vụ), tài khoản nhận chuyển khoản QR, ngưỡng lệch két khi đóng ca, hồ sơ hóa đơn điện tử, bí mật webhook của cổng thanh toán và ví điện tử (ZaloPay).

![Trang Cài đặt](../images/quan-ly/cai-dat.webp)

## Ai dùng, cần quyền gì

Cần quyền **Cài đặt cửa hàng** (vai trò mẫu: chỉ Chủ quán). Chọn tầng **Một máy của chi nhánh** còn cần quyền **Quản lý thiết bị** để thấy danh sách máy.

## Các bước

1. Mở **Cửa hàng → Cài đặt**. Muốn đặt sẵn công tắc theo kiểu quán thì dùng [Mẫu loại quán](16-mau-loai-quan.md).
2. Chọn **Tầng cài đặt**:
   - **Thương hiệu …** — áp cho mọi chi nhánh của thương hiệu;
   - **Chi nhánh …** (chi nhánh đang xem) — áp cho mọi máy của chi nhánh;
   - **Một máy của chi nhánh** — chọn máy ở ô **Máy**.
   Tầng hẹp hơn đặt riêng thì thắng tầng rộng hơn.
3. Mỗi mục ghi giá trị đang áp dụng lấy từ đâu: **Mặc định hệ thống / Lấy từ thương hiệu / Lấy từ chi nhánh / Đặt riêng cho máy**. Mục đã đặt ở tầng đang chọn có chữ **Đặt ở tầng này** và nút **Dùng lại giá trị của tầng trên** để bỏ giá trị riêng.
4. Ba nhóm (tab): **Tính năng**, **Thu tiền và két**, **Hóa đơn và kết nối**. Công tắc được lưu **ngay khi bấm**; các khung có ô nhập (cách tính tiền, tài khoản, hồ sơ hóa đơn…) thì sửa rồi bấm nút lưu của khung đó.
5. Mục không đặt được ở tầng đang chọn hiện "Không sửa ở tầng này: đặt ở chi nhánh hoặc thương hiệu."

## Công tắc tính năng

| Công tắc | Mặc định | Đặt được tới tầng | Ràng buộc | Hiện có tác dụng gì |
|---|---|---|---|---|
| Quản lý bàn | tắt | chi nhánh | — | Máy quầy hiện chế độ **bán tại bàn** và sơ đồ bàn |
| Quầy trả tiền trước | **bật** | máy | — | **luôn bật, khóa** (nhãn **Sắp có**): máy quầy thu tiền trước khi gửi bếp; quầy gửi bếp trước khi trả chưa có. Ô bật / tắt bị khóa ở "bật", máy chủ từ chối lệnh tắt (`API_SETTINGS_FLAG_LOCKED_ON`) |
| In tem ly | tắt | máy | — | Máy quầy in **tem dán ly** (cho món đánh dấu "In tem dán ly") khi thu tiền đơn quầy, và **khi gửi bếp một đơn bàn** (tem của phần vừa gửi). **Tắt ⇒ không in tem ly nào** |
| Chia phiếu theo trạm pha chế/bếp | tắt | chi nhánh | — | **Bật**: mỗi trạm một phiếu. **Tắt**: **một phiếu chung** tiêu đề "Phiếu chung", gồm mọi món có trạm, in ở máy in của trạm **đầu tiên theo tên** của chi nhánh (món không gán trạm vẫn không lên phiếu nào) |
| Ra món theo lượt | tắt | chi nhánh | cần **Quản lý bàn** | khóa, nhãn **Sắp có**: máy quầy chưa làm theo |
| Khách gọi món bằng QR tại bàn | tắt | chi nhánh | cần **Quản lý bàn** | khóa, nhãn **Sắp có**: máy quầy chưa làm theo |
| Giá theo khung giờ | tắt | thương hiệu | — | **Bật**: máy quầy và máy chủ áp giá theo khung giờ / ngày / thời hạn của [Bảng giá](14-bang-gia.md). **Tắt**: bỏ các dòng giá có hẹn giờ, mọi món bán theo giá gốc (giá cả ngày của chi nhánh, của kênh bán vẫn áp) |
| Theo dõi tồn kho | tắt | chi nhánh | — | khóa, nhãn **Sắp có** |
| Tự báo hết món khi tồn về 0 | tắt | chi nhánh | cần **Theo dõi tồn kho**; không bật cùng **Cho bán khi tồn âm** | khóa, nhãn **Sắp có** |
| Cho bán khi tồn âm | tắt | chi nhánh | cần **Theo dõi tồn kho**; không bật cùng **Tự báo hết món…** | khóa, nhãn **Sắp có** |
| Hóa đơn điện tử | tắt | chi nhánh | — | không có ô bật / tắt: dòng ghi "Công tắc này không có tác dụng. Bật / tắt hóa đơn điện tử ở Hồ sơ hóa đơn điện tử bên dưới" kèm đường dẫn tới nhóm **Hóa đơn và kết nối**; việc xuất hóa đơn do ô **"Xuất hóa đơn cho mọi đơn đã thanh toán"** trong hồ sơ hóa đơn quyết định |
| Làm tròn tiền mặt | tắt | chi nhánh | — | khóa, nhãn **Sắp có** |
| Hủy món đã gửi bếp phải có người duyệt | **bật** | chi nhánh | — | Bật: thu ngân không có quyền "Hủy món đã gửi bếp/pha chế" phải nhờ người duyệt; tắt: ai cũng hủy được món đã gửi |

"Chưa có tác dụng" nghĩa là giá trị được lưu, kiểm ràng buộc và gửi tới máy quầy, nhưng chưa phần nào của hệ thống làm theo nó (xem [discrepancies](../discrepancies.md#backoffice-và-vận-hành)).

## Thu tiền và két

![Nhóm Thu tiền và két](../images/quan-ly/cai-dat-thu-tien.webp)

- **Cách tính tiền đơn** (đặt tới tầng chi nhánh): **Giá bán đã gồm VAT** (mặc định bật); **Thu phí dịch vụ**: **Phí dịch vụ (%)**, **Áp cho kênh** (Tại bàn, Mang đi, Quán tự giao, Ứng dụng giao hàng — chọn ít nhất một), **Tính phí trên** tiền hàng trước hoặc sau giảm giá, **Thuế suất VAT của phí (%)**. Đơn mới chép cách tính đang áp dụng lúc mở đơn; đổi cài đặt **không tính lại** đơn đã mở.
- **Tài khoản nhận chuyển khoản** (chi nhánh): **Ngân hàng** (chọn trong danh sách, hoặc "Ngân hàng khác" rồi nhập **Mã BIN** 6 số), **Số tài khoản**, **Tên chủ tài khoản**. Máy quầy tạo mã VietQR vào tài khoản này. **Chưa đặt thì máy quầy không nhận chuyển khoản.**
- **Ngưỡng chênh lệch khi đóng ca** (đặt tới tầng máy): ô **Số tiền chênh lệch tối đa (đ)**, gõ số đồng nguyên (ví dụ `5000` hoặc `5.000`) rồi bấm **Lưu**. Tiền mặt đếm được lệch quá số này (thừa hoặc thiếu) thì phải có quản lý duyệt mới đóng ca. **Lệch trong mức này vẫn được ghi lại, chỉ không cần quản lý xác nhận.** Mặc định **0 đ** — lệch bất kỳ đồng nào cũng cần duyệt; muốn nới thì tự đặt (ví dụ 5.000 đ). Chỉ một mức, cho tiền mặt trong két (tiền QR khớp bằng ngân hàng, không đếm ở két). Máy quầy nhận mức mới ở lần đồng bộ kế tiếp và dùng nó ngay ở màn đóng ca (xem [Thu/chi két và đóng ca](../may-quay/07-thu-chi-va-dong-ca.md)).

## Hóa đơn và kết nối

![Nhóm Hóa đơn và kết nối](../images/quan-ly/cai-dat-hoa-don.webp)

- **Hồ sơ hóa đơn điện tử** (chi nhánh): **Xuất hóa đơn cho mọi đơn đã thanh toán**, **Mã số thuế**, **Tên người bán**, **Địa chỉ**, **Ký hiệu mẫu hóa đơn**, **Nhà cung cấp hóa đơn** (mã nhà cung cấp đã kết nối với máy chủ, ví dụ vnpt, viettel, misa), **Quy định áp dụng**, **Khi hoàn tiền** (không xuất hóa đơn riêng / xuất hóa đơn điều chỉnh). Chưa đặt hồ sơ thì chi nhánh không xuất hóa đơn nào.
- **Bí mật webhook cổng thanh toán** (chỉ ở tầng chi nhánh): chọn **Cổng thanh toán** (SePay, PayOS), dán **Bí mật mới**, bấm **Lưu bí mật**. Cổng thanh toán ký thông báo chuyển khoản bằng bí mật này; có nó máy chủ mới tin được thông báo "đã nhận tiền" để QR tự xác nhận. Bí mật **chỉ ghi, không bao giờ hiện lại**; muốn thay thì nhập bí mật mới.

- **Ví điện tử** (chỉ ở tầng chi nhánh): mỗi ví một khung (hiện có **ZaloPay**). Đánh dấu **Bật ZaloPay ở chi nhánh này**, nhập **App ID**, **Key1**, **Key2** do ZaloPay cấp cho quán, bấm **Lưu ví**. Lưu xong ba ô khóa tự trống, khung chỉ ghi **Đã lưu khóa** (hoặc **Chưa có khóa**) — khóa **không bao giờ hiện lại**. Muốn chỉ bật/tắt ví mà giữ khóa cũ: để trống ba ô khóa, đổi dấu bật rồi bấm **Lưu ví**. Bật ví thì ngăn thanh toán ở mọi máy quầy của chi nhánh có thêm thẻ **ZaloPay** ở lần đồng bộ kế tiếp; tắt thì thẻ mất đi.

## Luật và giới hạn

- Ví điện tử: chỉ người có quyền **Cài đặt cửa hàng** mới xem và lưu được; App ID là dãy số (tối đa 12 chữ số), Key1/Key2 dài 8–256 ký tự, không khoảng trắng. Khóa được máy chủ mã hóa bằng `FNB_PAYMENT_SECRET_KEY`, gắn với đúng chi nhánh. Lần đầu bật ví phải nhập đủ ba ô. Máy chủ dùng ZaloPay **sandbox** (ứng dụng thử) khi chạy thử và ZaloPay **thật** khi `FNB_ENV=production` (đổi bằng `FNB_ZALOPAY_ENV`). Thông báo "đã trả" của ZaloPay chỉ tới được máy chủ khi người vận hành đặt địa chỉ công khai `FNB_PUBLIC_API_URL` (https); không có thì máy chủ tự hỏi ZaloPay vài giây một lần cho các mã đang chờ.
- Bật một công tắc mà công tắc nó cần đang tắt, hoặc bật hai công tắc loại trừ nhau, bị từ chối ngay — ở **mọi tầng** (kể cả khi xung đột nằm ở một máy hay một chi nhánh khác). Trang nói rõ xung đột ở đâu.
- Phí dịch vụ: tỉ lệ **> 0 và ≤ 100%**, tối đa 2 chữ số thập phân; thuế suất của phí 0–100%.
- Số tài khoản 1–19 chữ số hoặc chữ cái không dấu; tên chủ tài khoản tối đa 80 ký tự.
- Ngưỡng chênh lệch: số đồng nguyên, **không âm** (0 là mặc định); số âm, số lẻ hay chữ bị từ chối ngay trên trang, không gửi đi.
- Mã số thuế: 10 số, 10 số-3 số, hoặc 12 số. Ký hiệu mẫu như **1C26MAB**: 1 hoặc 2, chữ C, 2 số năm, chữ M, 2 chữ cái in hoa.
- Quy định áp dụng hiện chỉ có một lựa chọn (`nd254-tt91`), soạn từ nguồn thứ cấp và **chưa đối chiếu công báo** — hỏi kế toán trước khi dùng với dữ liệu thật.
- Bí mật webhook: 16–256 ký tự, không khoảng trắng, không dấu tiếng Việt; **mỗi chi nhánh một bí mật riêng** cho cùng cổng; được máy chủ mã hóa bằng khóa `FNB_PAYMENT_SECRET_KEY`.
- Cài đặt tới máy quầy ở lần đồng bộ kế tiếp, chỉ tới các máy nằm trong phạm vi của tầng vừa sửa.

## Khi có lỗi

| Màn hình báo | Làm gì |
|---|---|
| “X” cần bật “Y” trước. · Xung đột ở … | Bật công tắc Y (ở đúng nơi được nêu) trước |
| “X” và “Y” không bật cùng lúc được. | Tắt một trong hai |
| Cài đặt này không đặt được ở tầng đang chọn. | Chọn tầng rộng hơn |
| Nhập tỉ lệ lớn hơn 0 và không quá 100, tối đa 2 chữ số thập phân. | Sửa phí dịch vụ |
| Chọn ít nhất một kênh. | Chọn kênh áp phí |
| Nhập số tiền là số đồng nguyên, ví dụ 35000 hoặc 35.000. | Ngưỡng chênh lệch gõ sai (số âm, số lẻ, chữ): gõ lại số đồng không âm |
| Chọn ngân hàng hoặc nhập đủ 6 chữ số mã BIN. | Sửa ngân hàng |
| Số tài khoản gồm 1 đến 19 chữ số hoặc chữ cái, không dấu. | Sửa số tài khoản |
| Mã số thuế gồm 10 số, 10 số-3 số, hoặc 12 số. | Sửa MST |
| Ký hiệu như 1C26MAB: … | Sửa ký hiệu |
| Máy chủ chưa kết nối nhà cung cấp hóa đơn này. Kiểm tra lại mã nhà cung cấp. | Sửa mã nhà cung cấp, hoặc nhờ người vận hành bật nhà cung cấp |
| Quy định đã chọn không cho cách xử lý hoàn tiền này. | Chọn cách hoàn tiền khác |
| Bí mật dài 16 đến 256 ký tự, không có khoảng trắng hay dấu tiếng Việt. | Dán lại đúng bí mật cổng cấp |
| Một chi nhánh khác đã dùng bí mật này cho cùng cổng thanh toán. Mỗi chi nhánh cần bí mật riêng. | Tạo bí mật khác ở cổng thanh toán |
| Máy chủ chưa được cấu hình để lưu bí mật cổng thanh toán. Báo hỗ trợ. | Người vận hành đặt `FNB_PAYMENT_SECRET_KEY` |
| Ví chưa có khóa: nhập App ID, Key1 và Key2 rồi mới bật được. · Nhập đủ App ID, Key1 và Key2 lần đầu bật ví. | Nhập đủ ba ô khóa ZaloPay cấp |
| App ID là dãy số ZaloPay cấp cho quán. | Sửa App ID |
| Khóa dài 8 đến 256 ký tự, không có khoảng trắng hay dấu tiếng Việt. | Dán lại đúng Key1 / Key2 |
| Cần quyền quản lý thiết bị để chọn máy. | Nhờ chủ quán, hoặc đặt ở tầng chi nhánh |

## Mất mạng thì sao

Sửa cài đặt cần mạng. Máy quầy đang mất mạng dùng cài đặt đã đồng bộ lần trước.

## Chưa làm / sắp có

- Các công tắc có nhãn **Sắp có** (ra món theo lượt, gọi món QR, tồn kho ×3, làm tròn tiền mặt) bị khóa vì máy quầy chưa làm theo; mở khóa khi tính năng có. Quầy **gửi bếp trước khi trả** cũng chưa có (công tắc Quầy trả tiền trước khóa ở "bật").
- Chưa có cài đặt giờ bắt đầu ngày kinh doanh hay múi giờ trên màn hình (mặc định 04:00, giờ Việt Nam khi tạo chi nhánh).
- Chưa có cài đặt máy in, mẫu hóa đơn in, logo.
- Ví **MoMo** và **VNPay** chưa có (làm khi có tài khoản thử, cùng khung **Ví điện tử**); chưa hoàn tiền qua ví.
