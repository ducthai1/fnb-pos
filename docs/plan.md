# Plan — Hệ thống quản lý quán F&B đa loại hình (SaaS)

> 2026-10-19 · Trạng thái: **user đã duyệt stack + mốc R1–R4 (2026-10-19), đang ở phase 00** · Repo code: chưa có (task T00-06).
> Đầu vào: SaaS nhiều quán · bắt đầu 1 quán · quầy dùng Windows + tablet Android + iPad + điện thoại · chạy cả online và offline · **quán thí điểm: cafe có cả quầy và bàn** · không gấp · **Claude viết code qua nhiều phiên** ⇒ docs/rule/test phải đủ để phiên mới làm tiếp.
> **Phiên mới bắt đầu ở [docs-index-and-reading-order.md](docs-index-and-reading-order.md).**

## Tài liệu nền
- [Bảng task chi tiết tới R1](tasks-r1-detailed-task-board.md) · [Quy trình mỗi phiên](development-workflow-for-claude-sessions.md) · [Sổ quyết định](decision-log.md)
- [Quy ước code](code-structure-and-conventions.md) · [Chiến lược test](testing-strategy-and-test-file-layout.md) · [Bản đồ tính năng](feature-map-by-release.md)
- [Danh mục logic](logic-catalog-flows-rules-and-design-decisions.md) — luật nghiệp vụ, đề xuất, câu hỏi mở
- [Kiến trúc & stack](architecture-and-stack-decision.md) — TS mọi tầng, React SPA trong Tauri/Capacitor/trình duyệt, Node + Postgres
- Nghiên cứu: [A bán hàng](research/research-a-ban-hang-menu-don-ban-bep-thanh-toan-ca.md) · [B kho](research/research-b-kho-dinh-luong-ban-thanh-pham-gia-von.md) · [C chuỗi/khách](research/research-c-chuoi-khuyen-mai-thanh-vien-phan-quyen-bao-cao.md) · [D VN/kỹ thuật](research/research-d-hoa-don-dien-tu-vietqr-giao-hang-offline-in-an.md) · [E API VN](research/research-e-api-cong-khai-kiotviet-cukcuk-sapo-pos365-ipos.md) · [F code Odoo](research/research-f-odoo-pos-18-luat-chinh-xac-tu-ma-nguon.md)

## Phase

| # | Phase | Mốc | Ước lượng (tuần-người) | Trạng thái |
|---|---|---|---|---|
| 00 | [Chốt yêu cầu & kiểm chứng kỹ thuật](phase-00-chot-yeu-cau-va-kiem-chung-ky-thuat.md) | — | 2–3 | chưa bắt đầu |
| 01 | [Nền móng: tenant, xác thực, quyền, thiết bị](phase-01-nen-mong-tenant-xac-thuc-quyen-thiet-bi.md) | — | 3–4 | chưa bắt đầu |
| 02 | [Lõi nghiệp vụ dùng chung](phase-02-loi-nghiep-vu-dung-chung-gia-thue-don.md) | — | 3–4 | chưa bắt đầu |
| 03 | [Menu, cấu hình, mẫu loại quán](phase-03-menu-cau-hinh-quan-va-mau-loai-quan.md) | — | 2–3 | chưa bắt đầu |
| 04 | [Bán tại quầy offline, đồng bộ, in, ca](phase-04-ban-tai-quay-offline-dong-bo-in-an-ca-ket.md) | — | 6–8 | chưa bắt đầu |
| 04b | [Bàn cơ bản (cafe quầy + bàn)](phase-04b-ban-co-ban-cho-cafe-quay-va-ban.md) | — | 2–3 | chưa bắt đầu |
| 05 | [QR tự xác nhận, hóa đơn điện tử, chốt ngày](phase-05-thanh-toan-qr-hoa-don-dien-tu-chot-ngay-bao-cao.md) | **R1** quán thí điểm dùng thật | 4–6 | chưa bắt đầu |
| 06 | [Bàn nâng cao, bếp, order điện thoại](phase-06-ban-bep-order-dien-thoai-chia-gop-ban.md) | **R2** | 4–6 | chưa bắt đầu |
| 07 | [Kho, định lượng, giá vốn](phase-07-kho-dinh-luong-ban-thanh-pham-gia-von.md) | **R2** | 5–7 | chưa bắt đầu |
| 08 | [Khách hàng, điểm, khuyến mãi, ví](phase-08-khach-hang-tich-diem-khuyen-mai-vi.md) | R3 | 4–6 | chưa bắt đầu |
| 09 | [Chuỗi nhiều chi nhánh, chuyển kho](phase-09-chuoi-nhieu-chi-nhanh-chuyen-kho.md) | R3 | 3–5 | chưa bắt đầu |
| 10 | [QR tự gọi món, app giao hàng](phase-10-qr-tu-goi-mon-va-app-giao-hang.md) | R3 | 4–6 | chưa bắt đầu |
| 11 | [SaaS thương mại & vận hành](phase-11-saas-thuong-mai-dang-ky-goi-cuoc-van-hanh.md) | vận hành trước R1 · **R4** mở bán | 4–6 | chưa bắt đầu |

Tổng thô: R1 ≈ 22–31 · R2 +9–13 · R3 +11–17 · R4 +4–6 ⇒ ~46–67 tuần-người (quy theo người làm; Claude làm tuần tự nên con số chỉ để so độ lớn giữa các phase). **Sai số lớn**; chốt lại sau phase 00.

## Thứ tự & phụ thuộc
```
00 ─┬─► 01 ─┐
    └─► 02 ─┴─► 03 ─► 04 ─► 04b ─► 05 ═► R1 ─┬─► 06 ─┐
                                      └─► 07 ─┴═► R2 ─► 08 ─► 09 ─► 10 ═► R3 ─► 11 ═► R4
11 (phần vận hành: giám sát, backup, staging, cập nhật app) chạy song song, xong trước R1
```

## Chặn trước khi code
1. Quán thí điểm cụ thể (loại quán, thiết bị, nhà cung cấp hóa đơn đang dùng).
2. Kế toán thuế xác nhận phần hóa đơn điện tử (catalog §18, §23 câu 12–15).
3. Spike in ấn + DB cục bộ có số đo (phase 00 S1, S2).

## Câu hỏi chưa giải quyết
- Nơi đặt repo code + remote (chặn T00-06).
- Hồ sơ quán thí điểm: nhân viên có order tại bàn bằng điện thoại không (nếu có ⇒ kéo FT-105 vào R1), có chia bill không.
- 9 câu nghiệp vụ/thuế ở catalog §23 (câu 7–15).
