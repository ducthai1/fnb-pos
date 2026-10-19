# Spike S2 — CSDL cục bộ + đồng bộ tự làm (đo, không phải code sản phẩm)

> Trạng thái: **đang đo** — mục nào chưa có số là chưa chạy. Code: `spikes/local-db-sync/` (ngoài pnpm workspace).

## 1. Câu hỏi cần trả lời

Thiết kế "máy quầy giữ SQLite cục bộ + hàng đợi lệnh idempotent; server áp lệnh theo `command_id`; máy kéo thay đổi theo cursor" có giữ được **0 mất / 0 trùng** khi mạng chập chờn, chạy lại trên dữ liệu cũ, và 2 máy cùng đẩy không?

## 2. Thiết kế được kiểm

- **Máy quầy**: một `LocalStore` (async) cài trên `SqliteDriver` — cùng một chuỗi SQL chạy trên node:sqlite (đại diện SQLite native của Tauri/Capacitor) và SQLite WASM. Ghi đơn + dòng + lệnh outbox trong **một** giao dịch `BEGIN IMMEDIATE`; `device_seq` = `INTEGER PRIMARY KEY AUTOINCREMENT` của outbox.
- **Server** (Fastify + pg + Postgres 17 nhúng): `POST /commands` áp từng lệnh trong 1 transaction: khóa advisory → tra `applied_command` (có thì trả lại đúng kết quả cũ, kể cả từ chối) → kiểm `device_seq` đúng bằng `last_seq + 1` của máy đó (lệch thì trả `retry`, không phải từ chối) → luật nghiệp vụ (tính lại tiền bằng `packages/domain`) → ghi `applied_command`, `device_cursor`, `change_log`. `GET /changes?cursor=` trả theo `change_seq` (bigserial) tăng dần, mỗi thay đổi là ảnh chụp nguyên dòng.
- **Từ chối** trả kèm ảnh chụp đơn ở server; máy thay bản lạc quan của mình bằng ảnh đó.
- **Kéo về** chỉ áp khi outbox không còn lệnh chờ (kiểm trong cùng giao dịch áp + lưu cursor).

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

1. **Cursor bigserial bỏ sót thay đổi** (có test tái hiện `change-cursor-commit-order.test.ts`): `change_seq` cấp theo thứ tự BEGIN nhưng hiện ra theo thứ tự COMMIT. Máy A lấy seq 1, chưa commit; máy B lấy seq 3–4 và commit; máy C kéo, thấy 4, lưu cursor 4; A commit seq 1–2 → C **không bao giờ** thấy. Sửa: `pg_advisory_xact_lock` giữ từ trước khi cấp seq tới COMMIT (mỗi tenant một khóa) ⇒ thứ tự seq = thứ tự commit. Giá: ghi của một quán bị tuần tự hóa (đo ở mục 4).
2. **Test có thể xanh nhờ may**: lần đầu test trên không tái hiện được lỗi vì hai lệnh cùng `business_date` cùng cập nhật một dòng tổng ngày ⇒ khóa dòng đã vô tình tuần tự hóa. Bỏ khóa advisory đi mà vẫn xanh trong môi trường có "dòng nóng" là ảo giác; production không chắc có dòng nóng đó.
3. **Lệnh của một máy phụ thuộc nhau** (thêm món vào đơn vừa tạo): đến lệch thứ tự mà server từ chối "không thấy đơn" là **mất dữ liệu**. Server bắt buộc `device_seq` liên tiếp, lệch thì trả `retry` (không lưu gì), máy gửi lại từ chỗ hổng.
4. **Từ chối cũng phải lưu**: lệnh bị từ chối mà không lưu thì lần gửi lại có thể được chấp nhận vì trạng thái đã đổi ⇒ cùng một lệnh hai kết quả. `applied_command` lưu cả `rejected` + mã.
5. **So tổng tiền của lệnh "thêm món" với tổng đơn là sai** khi 2 máy cùng thêm món vào một đơn: server chỉ so tiền của chính dòng đó; lệnh "thanh toán" thì so tổng đơn (khách trả số tiền khác tổng hiện tại là xung đột thật, cần người xử lý).
6. **`rowid` tái sử dụng**: outbox dùng `INTEGER PRIMARY KEY` thường thì xóa dòng cuối xong số đó được cấp lại ⇒ hai lệnh khác nhau cùng `device_seq`. Phải `AUTOINCREMENT` (có test).
7. **Kiểu dữ liệu qua biên**: JSON không chở được `bigint` (tiền đi dạng chuỗi); `pg` trả `int8` dạng chuỗi (tốt cho tiền) nhưng trả `date` thành `Date` lúc nửa đêm giờ máy (lệch ngày kinh doanh) ⇒ đặt type parser giữ chuỗi; SQLite trả INTEGER dạng `number` (node:sqlite ném lỗi khi > 2^53 thay vì làm tròn) ⇒ đổi sang `bigint` ở đúng một chỗ đọc.

## 6. Spike KHÔNG kiểm được

_(điền dần)_

## 7. Kết luận

_(điền khi đo xong)_
