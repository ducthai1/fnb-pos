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
pnpm test                      # 21 test: store, server, sync dưới lỗi mạng, 2 máy
pnpm typecheck
pnpm measure:offline-sync      # → results/offline-then-sync.json
npx tsx src/scenarios/run-local-write-latency-scenario.ts   # → results/local-write-latency.json
pnpm measure:two-devices       # → results/two-devices.json
pnpm measure:browser           # → results/browser-opfs.json
```
Số liệu gốc nằm ở `spikes/local-db-sync/results/*.json`. Máy đo: 12 nhân, ext4 trên NVMe. Dữ liệu kịch bản đặt ở `spikes/local-db-sync/tmp/` (ổ thật) vì `/tmp` của máy là tmpfs — trên tmpfs `fsync` miễn phí, số ghi đẹp gấp ~30 lần thực tế (đo được: p50 0,049 ms trên tmpfs so với 1,59 ms trên ổ thật).

## 4. Kết quả đo

| Kịch bản | Số đo | Kết quả |
|---|---|---|
| 2.000 đơn offline rồi đồng bộ (mạng sạch, lô 100) | mất / trùng / thời gian | **0 / 0**; 2,8 s (đẩy 2.000 lệnh 2,67 s ≈ 1,3 ms/lệnh vì mỗi lệnh 1 transaction có fsync; kéo 8.000 thay đổi 0,13 s) |
| Ghi 1 đơn (đơn + 3 dòng + outbox) — node:sqlite, WAL, `synchronous=FULL` | p50 / p95 / p99 | 1,59 / 1,99 / 4,2 ms |
| Như trên, `synchronous=NORMAL` | p50 / p95 / p99 | 0,048 / 0,12 / 3,5 ms (p99 là lúc checkpoint WAL) |
| Ghi 1 đơn — WASM/OPFS (opfs-sahpool, Worker) | p50 / p95 | chưa đo |
| Dung lượng DB cục bộ sau 2.000 đơn (6.000 dòng + 2.000 lệnh outbox) | byte | 3,18 MB (~1,6 KB/đơn) sau checkpoint; WAL lúc đang chạy thêm 4,2 MB |
| Lần 2: khởi động lại server + mở lại đúng file SQLite, +500 đơn, 150 thêm món, 140 thanh toán, vừa ghi vừa sync, lỗi mạng + 20 lần rút mạng | mất / trùng / cursor lùi? | **0 / 0 / không lùi** (cursor 8.000 → 10.440); 118 request, 53 hỏng; server trả lại kết quả cũ 365 lần; 690 lệnh bị `retry` vì đảo thứ tự; xong 6,7 s sau đơn cuối |
| 2 máy cùng bán trên 200 đơn chung (mỗi máy 600 thao tác tạo/thêm món/thanh toán trong 3,1 s, lỗi mạng + 20 lần rút mạng mỗi máy) | thứ tự change_seq / hội tụ | **Hội tụ**: băm trạng thái máy A = máy B = server; 0 mất, 0 trùng; trong feed, thay đổi của mỗi máy giữ đúng thứ tự `device_seq` (0 vi phạm), xen kẽ giữa 2 máy 49 lần; cursor không lùi. Từ chối hợp lệ: A 69, B 123 (`ALREADY_PAID` / `TOTAL_MISMATCH`) trên ~1.390 lệnh; hội tụ xong 8,4 s sau thao tác cuối |
| Như trên nhưng **bỏ khóa advisory** | | Lần chạy này vẫn hội tụ (lệnh tạo/thanh toán tình cờ tuần tự hóa qua dòng tổng ngày), nhưng máy B nhận **20 từ chối giả `SYNC_DEVICE_SEQ_REUSED`** cho lệnh đã được áp — xem bẫy 11 |

## 5. Bẫy gặp phải

1. **Cursor bigserial bỏ sót thay đổi** (có test tái hiện `change-cursor-commit-order.test.ts`): `change_seq` cấp theo thứ tự BEGIN nhưng hiện ra theo thứ tự COMMIT. Máy A lấy seq 1, chưa commit; máy B lấy seq 3–4 và commit; máy C kéo, thấy 4, lưu cursor 4; A commit seq 1–2 → C **không bao giờ** thấy. Sửa: `pg_advisory_xact_lock` giữ từ trước khi cấp seq tới COMMIT (mỗi tenant một khóa) ⇒ thứ tự seq = thứ tự commit. Giá: ghi của một quán bị tuần tự hóa (đo ở mục 4).
2. **Test có thể xanh nhờ may**: lần đầu test trên không tái hiện được lỗi vì hai lệnh cùng `business_date` cùng cập nhật một dòng tổng ngày ⇒ khóa dòng đã vô tình tuần tự hóa. Bỏ khóa advisory đi mà vẫn xanh trong môi trường có "dòng nóng" là ảo giác; production không chắc có dòng nóng đó.
3. **Lệnh của một máy phụ thuộc nhau** (thêm món vào đơn vừa tạo): đến lệch thứ tự mà server từ chối "không thấy đơn" là **mất dữ liệu**. Server bắt buộc `device_seq` liên tiếp, lệch thì trả `retry` (không lưu gì), máy gửi lại từ chỗ hổng.
4. **Từ chối cũng phải lưu**: lệnh bị từ chối mà không lưu thì lần gửi lại có thể được chấp nhận vì trạng thái đã đổi ⇒ cùng một lệnh hai kết quả. `applied_command` lưu cả `rejected` + mã.
5. **So tổng tiền của lệnh "thêm món" với tổng đơn là sai** khi 2 máy cùng thêm món vào một đơn: server chỉ so tiền của chính dòng đó; lệnh "thanh toán" thì so tổng đơn (khách trả số tiền khác tổng hiện tại là xung đột thật, cần người xử lý).
6. **`rowid` tái sử dụng**: outbox dùng `INTEGER PRIMARY KEY` thường thì xóa dòng cuối xong số đó được cấp lại ⇒ hai lệnh khác nhau cùng `device_seq`. Phải `AUTOINCREMENT` (có test).
8. **`ORDER BY` bám vào alias đã ép sang text** (lỗi thật của spike, test tái hiện "pages in numeric change_seq order once sequence numbers reach two digits"): `SELECT change_seq::text AS change_seq … ORDER BY change_seq LIMIT n` sắp theo chữ ("10" < "9"); trang đầy kết thúc sớm, các dòng xếp sau nó **không bao giờ được gửi** — 5/300 đơn lệch ở máy. Test cũ chỉ có 4 thay đổi (một chữ số) nên xanh. Chỉ lộ ra nhờ phép so trạng thái máy = server sau khi đồng bộ. Sửa: không ép kiểu (pg đã trả int8 dạng chuỗi).
9. **Đo trên tmpfs là đo sai**: `/tmp` máy này là tmpfs, mọi số commit đẹp gấp ~30 lần.
10. **Pipeline nhiều lô + bắt buộc thứ tự = tốn công**: 3 lô bay cùng lúc dưới mạng trễ ngẫu nhiên ⇒ 690 lệnh bị trả `retry` (đúng, không mất gì) nhưng phí băng thông. Sản phẩm nên để 1 lô/lần (đẩy 2.000 lệnh vẫn < 3 s).
11. **Kiểm idempotent trước khi khóa hàng của máy** (chỉ lộ khi bỏ khóa advisory): hai bản của cùng một lệnh đến cùng lúc (gửi trùng / bản trễ) đều không thấy `applied_command`; bản sau chờ `FOR UPDATE` trên `device_cursor`, rồi thấy seq đã qua ⇒ trả "seq bị dùng lại" — **từ chối giả cho lệnh đã áp** (thu ngân thấy "đơn bị từ chối" dù đơn đã lên server). Khóa advisory theo tenant tránh được; nếu sau này đổi sang khóa theo máy thì phải khóa `device_cursor` **trước** rồi mới tra `applied_command`.
12. **"Chỉ kéo về khi outbox rỗng" bị đói lúc cao điểm**: trong 3,1 s hai máy ghi liên tục, mỗi máy kéo về ≤ 2 lần (cả kịch bản chỉ 6–8 request kéo) — máy bán trên dữ liệu cũ của máy kia ⇒ tỉ lệ từ chối 5–18 %. Cách sửa ngây thơ "vẫn kéo, bỏ qua dòng của đơn còn lệnh chờ, cursor vẫn tiến" **làm lệch vĩnh viễn**: lệnh của máy đã được áp nhưng mất phản hồi ⇒ thay đổi của chính nó bị bỏ qua lúc kéo, lần gửi lại chỉ nhận "đã áp" ⇒ máy giữ bản lạc quan cũ mãi. Muốn kéo trong lúc còn lệnh chờ thì kết quả `accepted` phải kèm ảnh chụp đơn sau khi áp (như `rejected`) — chưa kiểm trong spike.
7. **Kiểu dữ liệu qua biên**: JSON không chở được `bigint` (tiền đi dạng chuỗi); `pg` trả `int8` dạng chuỗi (tốt cho tiền) nhưng trả `date` thành `Date` lúc nửa đêm giờ máy (lệch ngày kinh doanh) ⇒ đặt type parser giữ chuỗi; SQLite trả INTEGER dạng `number` (node:sqlite ném lỗi khi > 2^53 thay vì làm tròn) ⇒ đổi sang `bigint` ở đúng một chỗ đọc.

## 6. Spike KHÔNG kiểm được

_(điền dần)_

## 7. Kết luận

_(điền khi đo xong)_
