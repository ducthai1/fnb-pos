# Spike S2 — CSDL cục bộ + đồng bộ tự làm (đo, không phải code sản phẩm)

> Trạng thái: **đã đo xong** (2026-10-20; mỗi kịch bản chạy 2–3 lần, bảng ghi khoảng). Code: `spikes/local-db-sync/` (ngoài pnpm workspace). Số liệu gốc: `spikes/local-db-sync/results/*.json`.

## 1. Câu hỏi cần trả lời

Thiết kế "máy quầy giữ SQLite cục bộ + hàng đợi lệnh idempotent; server áp lệnh theo `command_id`; máy kéo thay đổi theo cursor" có giữ được **0 mất / 0 trùng** khi mạng chập chờn, chạy lại trên dữ liệu cũ, và 2 máy cùng đẩy không? Giá ghi cục bộ bao nhiêu trên SQLite native và SQLite WASM/OPFS?

**Trả lời ngắn:** có — 0 mất / 0 trùng ở mọi kịch bản, 2 máy hội tụ đúng từng byte với server. Nhưng chỉ sau khi sửa 3 lỗi tinh vi mà test tìm ra (mục 5: bẫy 1, 8, 11). Giữ thiết kế tự làm (mục 7).

## 2. Thiết kế được kiểm

- **Máy quầy**: một `LocalStore` (async) cài trên `SqliteDriver` — **cùng một chuỗi SQL** chạy trên node:sqlite (đại diện SQLite native của Tauri/Capacitor) và SQLite WASM 3.53.4 (VFS `opfs-sahpool` trong Worker). Ghi đơn + dòng + lệnh outbox trong **một** giao dịch `BEGIN IMMEDIATE`; `device_seq` = `INTEGER PRIMARY KEY AUTOINCREMENT` của outbox. Mọi giao dịch nằm gọn trong **một** lời gọi (không trải qua `await`) vì trên Tauri/Capacitor mỗi lời gọi là một lần qua cầu IPC.
- **Server** (Fastify 5 + pg + Postgres 17.10 nhúng): `POST /commands` áp từng lệnh trong 1 transaction: khóa advisory → tra `applied_command` (có thì trả lại đúng kết quả cũ, kể cả từ chối) → kiểm `device_seq` đúng bằng `last_seq + 1` của máy đó (lệch thì trả `retry`, không lưu gì) → luật nghiệp vụ (tính lại tiền bằng `packages/domain`) → ghi `applied_command`, `device_cursor`, `change_log`. `GET /changes?cursor=` trả theo `change_seq` (bigserial) tăng dần; mỗi thay đổi là ảnh chụp nguyên dòng.
- **Từ chối** trả kèm ảnh chụp đơn ở server; máy thay bản lạc quan bằng ảnh đó (trong cùng giao dịch đánh dấu lệnh).
- **Kéo về** chỉ áp khi outbox không còn lệnh chờ; áp + lưu cursor cùng một giao dịch; cursor lùi ⇒ ném lỗi.
- **Client**: lô 20–100 lệnh, backoff lũy thừa có jitter, timeout 2 s, tùy chọn nhiều lô bay cùng lúc.
- **Lỗi mạng giả lập** (bọc `fetch` trong tiến trình): rớt request, rớt response sau khi server đã áp, trễ, gửi trùng song song, giao muộn (client đã timeout và gửi lại, bản gốc tới sau các lô mới hơn ⇒ đảo thứ tự), rút mạng 20 lần ngẫu nhiên (đang rút: request mới hỏng ngay, response đang về bị mất).
- **Kiểm "mất / trùng"**: (a) mọi lệnh máy ghi nhận `accepted` đều có dòng tương ứng ở server; (b) trạng thái chuẩn hóa của máy == của server (so chuỗi/băm, gồm tiền, version, dòng); (c) `change_log` không có hai dòng cho cùng (lệnh, thực thể); (d) bảng tổng ngày (`business_day_total`, cộng dồn theo lệnh) khớp đúng với `orders` — áp đôi một lệnh sẽ làm lệch dù khóa chính che mất dòng trùng.

## 3. Cách chạy

```
cd spikes/local-db-sync
pnpm install --ignore-workspace
pnpm test                     # 21 test: store, server, lỗi mạng, 2 máy (~15 s)
pnpm typecheck
pnpm measure:write-latency    # → results/local-write-latency.json
pnpm measure:offline-sync     # → results/offline-then-sync.json
pnpm measure:two-devices      # → results/two-devices.json
pnpm measure:browser          # → results/browser-opfs.json (Chrome hệ thống, headless)
```
Máy đo: 12 nhân, ext4 trên NVMe, Chrome 151. Dữ liệu kịch bản đặt ở `spikes/local-db-sync/tmp/` (ổ thật, git bỏ qua) vì `/tmp` của máy là **tmpfs** — trên tmpfs `fsync` miễn phí: p50 ghi đơn đo được 0,049 ms so với 1,2–1,6 ms trên ổ thật.

## 4. Kết quả đo

| Kịch bản | Số đo | Kết quả |
|---|---|---|
| 2.000 đơn offline rồi đồng bộ — node:sqlite (mạng sạch, lô 100) | mất / trùng / thời gian | **0 / 0**; 2,8 s (đẩy 2.000 lệnh 2,7 s ≈ 1,35 ms/lệnh vì mỗi lệnh 1 transaction có fsync; kéo 8.000 thay đổi ≈ 0,1 s) |
| Như trên — WASM/OPFS trong Chrome (lô 25) | mất / trùng / thời gian | **0 / 0**; 4,2–5,1 s; băm trạng thái trình duyệt = server |
| Ghi 1 đơn (đơn + 3 dòng + outbox) — node:sqlite, WAL, `synchronous=FULL` | p50 / p95 / p99 | 1,2–1,6 / 1,4–2,0 / 2,9–4,2 ms (3 lần chạy) |
| Như trên, `synchronous=NORMAL` | p50 / p95 / p99 | 0,048 / 0,12 / 3,5 ms (p99 là lúc checkpoint WAL) |
| Ghi 1 đơn — WASM `opfs-sahpool` mặc định (journal DELETE; xin WAL bị từ chối) | p50 / p95 / p99 | 5,6–5,7 / 7,2–7,3 / 9,1–9,9 ms (2.000 đơn = 11,5 s) |
| WASM, `synchronous=NORMAL` | p50 / p95 | 5,0–5,1 / 6,3–6,5 ms |
| WASM, `journal_mode=PERSIST` | p50 / p95 | 3,3–3,4 / 4,4–4,7 ms |
| WASM, `locking_mode=EXCLUSIVE` + `journal_mode=WAL` (chạy được với sahpool) | p50 / p95 | **0,9–1,0 / 2,3–2,4 ms** |
| WASM, `journal_mode=OFF` (không an toàn, chỉ để so) | p50 / p95 | 1,0 / 1,8–1,9 ms |
| Dung lượng DB cục bộ sau 2.000 đơn (6.000 dòng + 2.000 lệnh outbox) | byte | native 3,18 MB (~1,6 KB/đơn) sau checkpoint, WAL lúc đang mở thêm 4,2 MB; WASM 3,25 MB, OPFS thực chiếm 9,4 MB (pool cấp sẵn ô) |
| **Lần 2** node: khởi động lại server + mở lại đúng file SQLite, +500 đơn, 150 thêm món, 140 thanh toán, vừa ghi vừa đồng bộ, lỗi mạng + 20 lần rút mạng, 3 lô bay cùng lúc | mất / trùng / cursor lùi? | **0 / 0 / không lùi** (8.000 → 10.440); 122 request, 54 hỏng; server trả lại kết quả cũ 275 lần; 750 lệnh nhận `retry` vì đảo thứ tự; xong 6,3 s sau đơn cuối |
| **Lần 2** trình duyệt: **tải lại trang**, worker mới mở lại đúng DB OPFS (cursor 8.000, 2.000 lệnh đã nhận còn nguyên), +500 đơn như trên, 1 lô/lần | mất / trùng / cursor lùi? | **0 / 0 / không lùi** (8.000 → 10.448); băm trình duyệt = server; xong 11,4–11,9 s sau đơn cuối |
| Tab thứ 2 cùng origin mở DB khi tab 1 đang giữ | | **Không mở được**: `createSyncAccessHandle … another open Access Handle` (bẫy 13) |
| **2 máy** cùng bán trên 200 đơn chung (mỗi máy 600 thao tác tạo/thêm món/thanh toán trong 3,1 s, lỗi mạng + 20 lần rút mạng mỗi máy) | thứ tự change_seq / hội tụ | **Hội tụ**: băm A = B = server; 0 mất, 0 trùng; thay đổi của mỗi máy giữ đúng thứ tự `device_seq` trong feed (0 vi phạm), xen kẽ giữa 2 máy 49 lần; cursor không lùi. Từ chối hợp lệ A 69, B 123 (`ALREADY_PAID` / `TOTAL_MISMATCH`) trên ~1.390 lệnh; hội tụ xong 8,4 s sau thao tác cuối |
| Như trên nhưng **bỏ khóa advisory** | | Lần chạy này vẫn hội tụ (lệnh tạo/thanh toán tình cờ tuần tự hóa qua dòng tổng ngày), nhưng máy B nhận **20–38 từ chối giả `SYNC_DEVICE_SEQ_REUSED`** cho lệnh đã được áp (bẫy 11). Việc bỏ sót thay đổi thì test tất định tái hiện được (bẫy 1) |

## 5. Bẫy gặp phải

1. **Cursor bigserial bỏ sót thay đổi** (test `change-cursor-commit-order.test.ts`): `change_seq` cấp theo thứ tự lấy số nhưng hiện ra theo thứ tự COMMIT. Máy A lấy seq 1–2, chưa commit; máy B lấy 3–4 và commit; máy C kéo, thấy 4, lưu cursor 4; A commit ⇒ C **không bao giờ** thấy 1–2. Sửa: `pg_advisory_xact_lock` giữ từ trước khi cấp seq tới COMMIT (sản phẩm: mỗi tenant một khóa) ⇒ thứ tự seq = thứ tự commit. Giá: ghi của một quán bị tuần tự hóa, đo được ≈ 1,35 ms/lệnh ⇒ ~700 lệnh/s/quán.
2. **Test có thể xanh nhờ may**: lần đầu test trên không tái hiện được lỗi vì hai lệnh cùng `business_date` cùng cập nhật một dòng tổng ngày ⇒ khóa dòng vô tình tuần tự hóa. Production không chắc có "dòng nóng" đó.
3. **Lệnh của một máy phụ thuộc nhau** (thêm món vào đơn vừa tạo): đến lệch thứ tự mà server từ chối "không thấy đơn" là **mất dữ liệu**. Server bắt `device_seq` liên tiếp, lệch thì trả `retry` (không lưu gì), máy gửi lại từ chỗ hổng.
4. **Từ chối cũng phải lưu**: không lưu thì lần gửi lại có thể được chấp nhận vì trạng thái đã đổi ⇒ một lệnh hai kết quả. `applied_command` lưu cả `rejected` + mã.
5. **So tổng tiền của lệnh "thêm món" với tổng đơn là sai** khi 2 máy cùng thêm món: server chỉ so tiền của chính dòng đó. Lệnh "thanh toán" thì so tổng đơn — khách trả khác tổng hiện tại là xung đột thật, cần người xử lý.
6. **`rowid` tái sử dụng**: outbox dùng `INTEGER PRIMARY KEY` thường thì xóa dòng cuối xong số đó được cấp lại ⇒ hai lệnh khác nhau cùng `device_seq`. Phải `AUTOINCREMENT` (có test).
7. **Kiểu dữ liệu qua biên**: JSON không chở được `bigint` (tiền đi dạng chuỗi); `pg` trả `int8` dạng chuỗi (tốt cho tiền) nhưng trả `date` thành `Date` lúc nửa đêm giờ máy (lệch ngày kinh doanh) ⇒ đặt type parser giữ chuỗi; SQLite (cả hai bản) trả INTEGER dạng `number` (node:sqlite ném lỗi khi > 2^53 thay vì làm tròn) ⇒ đổi sang `bigint` ở đúng một chỗ đọc.
8. **`ORDER BY` bám vào alias đã ép sang text** — lỗi thật của spike (test "pages in numeric change_seq order once sequence numbers reach two digits", đỏ trên code cũ: nhận 18/26 thay đổi): `SELECT change_seq::text AS change_seq … ORDER BY change_seq LIMIT n` sắp theo chữ ("10" < "9"), trang đầy kết thúc sớm, các dòng xếp sau nó **không bao giờ được gửi** — 5/300 đơn lệch ở máy. Test cũ chỉ có 4 thay đổi (một chữ số) nên xanh; chỉ lộ nhờ phép so trạng thái máy = server. Sửa: không ép kiểu.
9. **Đo trên tmpfs là đo sai** (xem mục 3).
10. **Nhiều lô bay cùng lúc + bắt buộc thứ tự = phí**: 3 lô dưới mạng trễ ngẫu nhiên ⇒ 750 lệnh nhận `retry` (đúng, không mất gì). Sản phẩm nên 1 lô/lần (đẩy 2.000 lệnh vẫn < 3 s).
11. **Tra idempotent trước khi khóa hàng của máy** (lộ khi bỏ khóa advisory): hai bản của cùng một lệnh đến cùng lúc đều không thấy `applied_command`; bản sau chờ `FOR UPDATE` trên `device_cursor`, rồi thấy seq đã qua ⇒ "seq bị dùng lại" — **từ chối giả cho lệnh đã áp** (thu ngân thấy "đơn bị từ chối" dù đơn đã lên server). Khóa advisory theo tenant tránh được; nếu sau này đổi sang khóa theo máy thì phải khóa `device_cursor` **trước** rồi mới tra `applied_command`.
12. **"Chỉ kéo về khi outbox rỗng" bị đói lúc cao điểm**: trong 3,1 s hai máy ghi liên tục, cả kịch bản chỉ có 6–8 request kéo — máy bán trên dữ liệu cũ của máy kia ⇒ 5–18 % lệnh bị từ chối. Cách sửa ngây thơ "vẫn kéo, bỏ qua dòng của đơn còn lệnh chờ, cursor vẫn tiến" **làm lệch vĩnh viễn**: lệnh đã được áp nhưng mất phản hồi ⇒ thay đổi của chính nó bị bỏ qua lúc kéo, lần gửi lại chỉ nhận "đã áp" ⇒ máy giữ bản lạc quan cũ mãi. Muốn kéo trong lúc còn lệnh chờ thì kết quả `accepted` phải kèm ảnh chụp đơn sau khi áp (như `rejected`) — **chưa kiểm**.
13. **`opfs-sahpool` chỉ một tab**: VFS giữ độc quyền access handle; tab thứ 2 cùng origin không mở được DB. POS bản web phải chặn mở 2 tab (Web Locks) hoặc nhường VFS (`pauseVfs`).
14. **WASM mặc định chậm gấp ~4 lần native-FULL**: journal DELETE + flush mỗi commit. `locking_mode=EXCLUSIVE` + WAL hợp với sahpool (vốn đã một kết nối) và đưa p50 về 1,0 ms.

## 6. Spike KHÔNG kiểm được

- **Tauri/Capacitor thật**: plugin SQLite native qua IPC (độ trễ mỗi lời gọi; plugin có giữ được một giao dịch nhiều câu lệnh trên **cùng** một kết nối không — nếu plugin dùng pool kết nối thì `BEGIN`/`COMMIT` gửi riêng có thể rơi vào kết nối khác; thiết kế "cả giao dịch trong một lời gọi" là để né, nhưng vỏ native phải có lệnh "chạy lô câu lệnh trong một giao dịch").
- **Safari iOS / iPadOS**: OPFS + sync access handle, và chính sách Safari xóa dữ liệu script-writable của trang không được cài lên màn hình chính sau một thời gian không dùng — với đơn chưa đồng bộ là mất dữ liệu thật. Android WebView cũng chưa chạy.
- **Mất điện thật / kill tiến trình giữa giao dịch**: chỉ dựa vào bảo đảm của SQLite (WAL + FULL); không rút điện máy thật.
- **Mạng thật** (TLS, 4G, proxy): lỗi được giả lập trong tiến trình, không ở tầng TCP.
- **Server nhiều instance, nhiều tenant, giữ `change_log` bao lâu** (máy offline lâu hơn thời gian giữ thì phải tải lại toàn bộ), migrate schema DB cục bộ, 5+ máy/quán lúc cao điểm, catalog lớn (menu, khách hàng) đi chiều kéo.
- **Bản sửa bẫy 12** (kết quả `accepted` kèm ảnh chụp đơn) chưa cài, chưa đo.

## 7. Kết luận

**Giữ thiết kế tự làm**, không cần PowerSync ở R1:
- Đạt 0 mất / 0 trùng trên mọi kịch bản kể cả lần chạy 2 trên dữ liệu cũ và 2 máy tranh nhau; lõi chỉ ~600 dòng (store ~250, server ~400, vòng sync ~180), chạy cùng SQL trên native lẫn WASM.
- Chiều **đẩy** (lệnh nghiệp vụ, idempotent, tính lại tiền) là phần phải tự viết **dù có dùng PowerSync** (PowerSync lo chiều kéo + SQLite cục bộ; ghi vẫn đi qua backend của mình). Chiều **kéo** theo cursor là phần PowerSync thay được, nhưng ở quy mô một quán nó đơn giản khi đã có khóa theo tenant + sắp số đúng.
- Rủi ro thật nằm ở **lỗi tinh vi** (bẫy 1, 8, 11 — cả ba chỉ lộ nhờ test đúng kiểu). Điều kiện để giữ: chuyển nguyên các test tái hiện của spike vào `packages/sync-client` / `apps/api` làm ratchet (đặc biệt: cursor không bỏ sót khi commit muộn, phân trang ≥ 2 chữ số, gửi trùng song song, đảo thứ tự lô, chạy lần 2 trên dữ liệu cũ, so trạng thái máy = server).

**Cân nhắc lại PowerSync (hoặc tương tự) khi**: cần đồng bộ một phần theo chi nhánh/người dùng cho nhiều loại dữ liệu (chuỗi R2+), catalog lớn phải kéo tăng dần, hoặc số máy/quán đẩy khóa theo tenant thành nút cổ chai (>~700 lệnh/s/quán).

**Việc cần làm trước khi code thật** (đưa vào backlog): (1) sửa bẫy 12 (`accepted` kèm ảnh chụp đơn) + test hội tụ khi kéo lúc còn lệnh chờ; (2) POS web: WAL + `locking_mode=EXCLUSIVE`, khóa một tab; (3) kiểm plugin SQLite của Tauri/Capacitor theo mục 6 trước khi chốt vỏ native; (4) quyết định `synchronous=FULL` (đề xuất, 1,2–1,6 ms/đơn là đủ nhanh) hay `NORMAL` trên máy quầy.
