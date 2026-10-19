# Spike S2 — CSDL cục bộ + đồng bộ tự làm (đo, không phải code sản phẩm)

> Trạng thái: **đang đo** — mục nào chưa có số là chưa chạy. Code: `spikes/local-db-sync/` (ngoài pnpm workspace).

## 1. Câu hỏi cần trả lời

Thiết kế "máy quầy giữ SQLite cục bộ + hàng đợi lệnh idempotent; server áp lệnh theo `command_id`; máy kéo thay đổi theo cursor" có giữ được **0 mất / 0 trùng** khi mạng chập chờn, chạy lại trên dữ liệu cũ, và 2 máy cùng đẩy không?

## 2. Thiết kế được kiểm

_(điền khi xong mục 1–3)_

## 3. Cách chạy

```
cd spikes/local-db-sync
pnpm install --ignore-workspace
```

## 4. Kết quả đo

| Kịch bản | Số đo | Kết quả |
|---|---|---|
| 2.000 đơn offline rồi đồng bộ | mất / trùng / thời gian | chưa đo |
| Ghi 1 đơn (đơn + 3 dòng + outbox) — node:sqlite | p50 / p95 | chưa đo |
| Ghi 1 đơn — WASM/OPFS (opfs-sahpool, Worker) | p50 / p95 | chưa đo |
| Dung lượng DB cục bộ sau 2.000 đơn | byte | chưa đo |
| Lần 2 trên cùng DB, +500 đơn, có lỗi mạng | mất / trùng / cursor lùi? | chưa đo |
| 2 thiết bị cùng đẩy | thứ tự change_seq / hội tụ | chưa đo |

## 5. Bẫy gặp phải

_(điền dần)_

## 6. Spike KHÔNG kiểm được

_(điền dần)_

## 7. Kết luận

_(điền khi đo xong)_
