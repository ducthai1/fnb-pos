---
title: Đăng nhập trang quản lý và chọn chi nhánh
audience: quan-ly
screens:
  - /login
decisions:
  - D-026
  - D-032
  - D-050
tests:
  - apps/backoffice/src/components/auth/login-form.test.tsx
  - apps/backoffice/src/lib/navigation/safe-return-path.test.ts
  - apps/backoffice/src/components/shell/admin-shell.test.tsx
  - apps/backoffice/src/components/shell/home-and-menu-offer-only-permitted-pages.test.tsx
  - apps/backoffice/src/components/shell/top-nav-bar.test.tsx
  - apps/backoffice/src/components/shell/nav-drawer.test.tsx
  - apps/api/test/integration/auth/backoffice-login.test.ts
  - apps/api/test/integration/auth/backoffice-session-organizations.test.ts
  - apps/api/test/integration/auth/backoffice-session-lifecycle.test.ts
  - apps/api/test/integration/auth/login-lock-is-audited.test.ts
---

# Đăng nhập trang quản lý và chọn chi nhánh

## Dùng để làm gì

Trang quản lý (backoffice) là nơi chủ quán và người quản lý làm mọi việc không làm ở máy quầy: sửa thực đơn, thêm nhân viên, ghép máy, xem doanh thu, chốt ngày, cài đặt. Trang mở bằng trình duyệt trên máy tính hoặc điện thoại, cùng địa chỉ với cửa hàng (ví dụ `https://quan.example.vn/`).

Nhân viên đứng quầy **không** đăng nhập ở đây: họ đăng nhập máy quầy bằng PIN (xem phần máy quầy của sổ tay).

## Ai dùng, cần quyền gì

- Ai có **tài khoản** (email hoặc số điện thoại + mật khẩu) thuộc ít nhất một cửa hàng đang hoạt động.
- Mỗi tài khoản trong một cửa hàng mang **đúng một vai trò** (cùng danh sách vai trò với nhân viên, xem [Nhân viên, vai trò và quyền](06-nhan-vien-vai-tro-quyen.md)). Vai trò quyết định menu hiện những mục nào: mục cần quyền mà vai trò không có thì không hiện trên menu; mở thẳng bằng địa chỉ thì trang báo **"Bạn chưa có quyền xem mục này"** kèm gợi ý "Nhờ chủ quán thêm quyền cho vai trò của bạn ở mục Vai trò."

| Mục trên menu | Nhóm | Quyền cần để mở |
|---|---|---|
| Thiết bị | Nhân sự & thiết bị | Quản lý thiết bị |
| Nhân viên, Vai trò | Nhân sự & thiết bị | Quản lý nhân viên và vai trò |
| Món, Danh mục, Hết món | Thực đơn | ai đăng nhập cũng xem được; **sửa** cần quyền Sửa menu |
| Doanh thu ngày, Chốt ngày, Khớp chuyển khoản, Phiếu in lỗi | Bán hàng & tiền | Xem báo cáo |
| Sơ đồ bàn, Cài đặt | Cửa hàng | Cài đặt cửa hàng |

## Các bước

![Trang đăng nhập](../images/quan-ly/dang-nhap.webp)

1. Mở địa chỉ của cửa hàng. Chưa đăng nhập thì trang tự chuyển tới **Đăng nhập trang quản lý**.
2. Nhập **Email hoặc số điện thoại** và **Mật khẩu**, bấm **Đăng nhập**.
3. Tài khoản thuộc nhiều tổ chức (ví dụ bạn làm cho hai công ty) thì trang hiện **Chọn tổ chức** — bấm **Vào <tên tổ chức>**. Muốn đổi tài khoản thì bấm **Đăng nhập tài khoản khác**.
4. Vào được thì trang mở lại đúng trang bạn định mở trước khi bị hỏi đăng nhập (chỉ trang trong cùng trang quản lý; địa chỉ lạ thì về trang Tổng quan).
5. Ở góc trên, ô **Chi nhánh đang xem** chọn chi nhánh mà mọi trang đang hiện số liệu. Trình duyệt nhớ lựa chọn này cho lần sau (trên đúng máy đó).
6. Trên máy tính (rộng từ 1024px) menu là thanh ngang với 4 nhóm; bấm tên nhóm để thả danh sách trang. Trên điện thoại bấm nút **Mở menu** để mở ngăn kéo.
7. Xong việc bấm **Đăng xuất**.

## Luật và giới hạn

- Sai mật khẩu **5 lần liền** thì tài khoản bị khóa **15 phút** (cố định, không tăng dần — để người biết email chủ quán không khóa được chủ quán hàng giờ). Mỗi lần khóa được ghi vào nhật ký.
- Phiên đăng nhập sống **7 ngày** kể từ lúc đăng nhập, không tự gia hạn: máy tính để quên sẽ tự hết quyền trong một tuần.
- Chỉ tài khoản đang hoạt động trong tổ chức mới vào được; tài khoản bị gỡ khỏi tổ chức sẽ bị hỏi chọn lại tổ chức.
- Quyền được đọc lại ở **mọi** lần gọi máy chủ: chủ quán bỏ một quyền khỏi vai trò thì người giữ vai trò mất quyền đó ngay ở thao tác kế tiếp, không cần đăng nhập lại.

## Khi có lỗi

| Màn hình báo | Nghĩa là | Làm gì |
|---|---|---|
| Nhập email hoặc số điện thoại. / Nhập mật khẩu. | Bỏ trống ô | Nhập đủ rồi bấm lại |
| Sai email/số điện thoại hoặc mật khẩu. Sai 5 lần liền thì tài khoản bị khóa 15 phút. | Sai thông tin, hoặc đang bị khóa | Kiểm tra lại; đã sai nhiều lần thì chờ 15 phút |
| Tài khoản này chưa thuộc cửa hàng nào đang hoạt động. | Tài khoản không còn trong cửa hàng nào | Nhờ chủ quán thêm lại |
| Tài khoản không còn thuộc tổ chức đã chọn. Chọn lại tổ chức. | Bị gỡ khỏi tổ chức vừa chọn | Chọn tổ chức khác |
| Phiên đăng nhập đã hết. Đăng nhập lại. | Quá 7 ngày, hoặc đã đăng xuất ở nơi khác | Đăng nhập lại |
| Không kiểm tra được phiên đăng nhập. | Mất mạng lúc mở trang | Bấm **Thử lại** |
| Không tải được danh sách chi nhánh. / Tổ chức chưa có chi nhánh nào. | Lỗi mạng / tổ chức chưa có chi nhánh | Thử lại; chi nhánh hiện do người vận hành tạo (chưa có màn tạo chi nhánh) |
| Máy chủ không nhận yêu cầu từ địa chỉ trang này. Mở trang quản lý bằng đúng địa chỉ của cửa hàng; nếu vẫn lỗi, báo hỗ trợ. | Trang được mở qua một địa chỉ máy chủ không cho phép | Mở bằng đúng địa chỉ cửa hàng; vẫn lỗi thì báo người vận hành (xem [Giới hạn và bảo mật](../van-hanh/04-gioi-han-va-bao-mat.md)) |
| Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại. | Mất mạng | Kiểm tra wifi/4G |

## Mất mạng thì sao

Trang quản lý **cần mạng** cho mọi việc. Mất mạng thì trang báo "Không kết nối được máy chủ…"; máy quầy vẫn bán bình thường vì máy quầy có dữ liệu riêng.

## Chưa làm / sắp có

- Đăng ký cửa hàng mới, tạo chi nhánh, thương hiệu, quên mật khẩu, đổi mật khẩu, mời thêm người quản lý: chưa có màn hình (người vận hành tạo bằng công cụ phía máy chủ).
- Chưa có "ghi nhớ đăng nhập" hay đăng nhập bằng mã OTP.
