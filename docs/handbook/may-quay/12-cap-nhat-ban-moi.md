---
title: Cập nhật bản mới của máy quầy
audience:
  - thu-ngan
  - quan-ly
  - van-hanh
screens:
  - update-banner
decisions:
  - D-123
  - D-128
  - D-141
tests:
  - apps/pos/src/features/updates/update-policy.test.ts
  - apps/pos/src/features/updates/release-watch.test.ts
  - apps/pos/src/screens/update/update-banner.test.tsx
  - apps/pos/test/browser/update-strip-covers-nothing-in-chrome.test.ts
  - apps/pos/src/app/use-app-update.test.tsx
  - apps/pos/src/app/till-offers-updates.test.tsx
  - apps/pos/build-release.test.ts
  - apps/pos/src/app/till-must-update-when-the-server-says-so.test.tsx
  - apps/pos/src/features/sync/till-sync-status.test.ts
  - packages/sync-client/test/scenarios/till-below-the-minimum-build-keeps-its-commands.test.ts
---

# Cập nhật bản mới của máy quầy

## Dùng để làm gì

Khi người vận hành đưa bản POS mới lên server, máy quầy tự biết và tự đổi sang bản mới **vào lúc không làm hỏng việc đang bán**: không bao giờ giữa lúc còn lệnh chưa gửi lên máy chủ, không giữa lúc đang thanh toán hay đang mở một bảng (duyệt, đếm tiền…). Nếu máy đang có ca mở, thẻ **"Có bản cập nhật — sẽ cập nhật sau khi đóng ca"** hiện ở góc dưới màn hình.

![Dải cập nhật trên màn bán](../images/may-quay/update-banner.webp)

Dải cập nhật nằm **ngang đầu màn hình**, trên thanh của máy quầy, và **chiếm chỗ riêng**: màn bán nằm dưới dải nên không có món, nút hay đơn nào bị che. Bấm mũi tên **Thu nhỏ** (góc phải dải) thì dải thành một dòng mỏng "Có bản cập nhật mới · Xem"; chạm vào dòng đó để mở lại. Thu nhỏ rồi vẫn thấy là có bản mới.

![Dải cập nhật đã thu nhỏ](../images/may-quay/update-banner-folded.webp)

### Khi cập nhật là bắt buộc

Có khi bản trên máy quá cũ so với máy chủ (máy chủ đã nâng cấp và không còn nhận thao tác của bản đó). Lúc ấy máy **không chờ đóng ca**: ngay khi đồng bộ báo bản quá cũ, máy hiện màn **Cần cập nhật máy bán hàng** thay cho mọi màn khác, với một nút **Cập nhật ngay**.

![Màn bắt buộc cập nhật](../images/may-quay/update-required.webp)

Màn nói rõ máy còn bao nhiêu thao tác chưa gửi: các thao tác đó **vẫn nằm trên máy** và tự gửi sau khi cập nhật, không mất và không rơi vào mục "Cần xử lý". Bấm **Cập nhật ngay** thì máy tải lại sang bản mới rồi vào lại màn đăng nhập PIN.

## Ai dùng, cần quyền gì

Thu ngân đang đứng quầy; không cần quyền riêng. Người vận hành xem [Đặt hệ thống lên server](../van-hanh/02-dat-len-server.md) để đưa bản mới lên.

## Các bước

**Máy chưa mở ca** (đầu ngày, hoặc sau khi đóng ca): máy tự tải lại sang bản mới khi **20 giây** không ai chạm vào màn hình, không còn lệnh chưa gửi và không có bảng nào đang mở. Thu ngân không phải làm gì.

**Máy đang có ca mở**:

1. Dải "Có bản cập nhật — sẽ cập nhật sau khi đóng ca" hiện ở đầu màn hình. Cứ bán bình thường; nếu thấy vướng, bấm **Thu nhỏ**.
2. Muốn cập nhật ngay (giờ vắng khách): bấm **Cập nhật ngay**. Nút chỉ bấm được khi **mọi lệnh đã lên máy chủ** và không có bảng nào đang mở; không thì nút mờ và thẻ nói phải chờ gì.
3. Hoặc đóng ca như thường lệ. Sau khi đóng ca, khi máy nhàn rỗi 20 giây, máy tự cập nhật.

Sau khi tải lại, máy vào lại màn đăng nhập PIN (hoặc mở ca) như khi mở máy; đơn đã ghi vẫn còn.

## Luật và giới hạn

- Máy hỏi máy chủ "đang phát hành bản nào" (`version.json`) khi mở, **mỗi 5 phút**, khi có mạng lại và khi trang hiện lại sau lúc bị ẩn.
- **Bản khác bản đang chạy là có cập nhật**, không phải "bản mới hơn": nếu người vận hành quay lui một bản trên server thì máy quầy cũng đổi về bản đó theo đúng cách này.
- Không bao giờ tự tải lại khi: còn lệnh chưa đồng bộ (kể cả khi đang chờ biết số lệnh), đang mở một ngăn kéo/bảng (thanh toán, duyệt, đếm tiền, chọn tùy chọn…), hoặc có người vừa chạm màn hình trong 20 giây (khi máy không có ca mở).
- Một bản đã thử tự tải lại rồi mà trang vẫn ở bản cũ (trình duyệt giữ bản cũ) thì máy **không tự tải lại lần nữa** trong phiên đó, để không vòng lặp; thu ngân vẫn bấm **Cập nhật ngay** được, hoặc người vận hành xóa bộ nhớ đệm.
- Chỉ khi người vận hành đặt **bản tối thiểu** trên máy chủ (mặc định không đặt, nhận mọi bản) thì máy quầy cũ hơn mức đó mới bị ép. Máy gửi **số bản** của nó (giờ của commit, tăng dần) kèm mọi lần đồng bộ; máy chủ so với mức tối thiểu và trả 426. Máy của bản chưa gửi số bản luôn được nhận (xem Vận hành).
- Máy chủ luôn nhận lệnh của **bản POS ngay trước** bản đang phát hành, để máy chưa kịp cập nhật vẫn đẩy được lệnh của nó (xem Vận hành).

## Khi có lỗi

| Thấy gì | Nghĩa là | Làm gì |
|---|---|---|
| "Có bản cập nhật — sẽ cập nhật sau khi đóng ca" | Có bản mới, máy đang có ca mở | Đóng ca, hoặc bấm **Cập nhật ngay** khi được |
| "Còn N thao tác chưa gửi lên máy chủ. Chờ gửi xong rồi cập nhật." (nút Cập nhật ngay mờ) | Còn lệnh trên máy chưa tới máy chủ | Chờ máy đồng bộ xong (xem biểu tượng đồng bộ trên thanh trên); không có mạng thì có mạng lại đã |
| "Máy đang kiểm tra thao tác chưa gửi. Chờ một chút rồi cập nhật." | Máy chưa biết còn bao nhiêu lệnh | Chờ vài giây |
| "Xong thao tác đang làm rồi hãy cập nhật." | Đang mở một bảng (thanh toán, duyệt…) | Xong hoặc đóng bảng đó |
| Dòng mỏng "Có bản cập nhật mới · Xem" | Dải đã thu nhỏ | Chạm để mở lại, rồi bấm **Cập nhật ngay** khi được |
| Nút "Đang cập nhật…" | Máy đang tải lại | Chờ |
| Màn "Cần cập nhật máy bán hàng" | Bản trên máy thấp hơn mức máy chủ còn nhận | Bấm **Cập nhật ngay**; thao tác chưa gửi được giữ và gửi sau |
| "Cập nhật xong mà vẫn hiện màn này" | Trình duyệt vẫn giữ bản cũ, hoặc server chưa có bản mới | Báo quản lý / người vận hành: xóa bộ nhớ đệm, hoặc kiểm bản trên server |

## Mất mạng thì sao

Máy không hỏi được bản đang phát hành thì giữ bản đang chạy và hỏi lại khi có mạng. Đang có thẻ cập nhật mà mất mạng: nút **Cập nhật ngay** chỉ bấm được khi không còn lệnh chưa gửi, nên mất mạng sau khi vừa bán thì nút mờ cho tới khi lệnh đã lên máy chủ — máy không đổi bản làm mất lệnh chưa gửi.

## Chưa làm / sắp có

- Máy quầy của bản chưa gửi số bản (trước khi có cơ chế ép) không ép được: máy chủ vẫn nhận lệnh của nó.
- Chưa áp dụng cho vỏ app cài trên máy (Tauri, Capacitor): chỉ bản web POS.
- Chưa có thông báo cho quản lý biết máy quầy nào còn chạy bản cũ.
