# Chiến lược test & vị trí file test

> Mục tiêu (user, 2026-10-19): sửa tính năng này không làm hỏng tính năng khác mà không ai biết. Luật gốc: **"có test" = gỡ hành vi ra thì test đỏ.** Test chỉ chạy qua với code đúng lẫn code sai là test vô dụng.

## 1. Các tầng test

| Tầng | Kiểm cái gì | Ở đâu | Công cụ | Chạy bằng |
|---|---|---|---|---|
| Domain | mọi luật tính tiền, trạng thái, hoàn, phân bổ, làm tròn, ngày kinh doanh | `packages/domain/src/**/<file>.test.ts` (cạnh file nguồn) | Vitest + fast-check | `pnpm test:unit` |
| Contract | schema zod: dữ liệu hợp lệ qua, dữ liệu sai bị chặn đúng mã | `packages/contracts/src/**/<file>.test.ts` | Vitest | `pnpm test:unit` |
| API tích hợp | route + DB thật: quyền, RLS, idempotent, tính lại tiền | `apps/api/test/integration/<miền>/<kịch-bản>.test.ts` | Vitest + Postgres 17 thật chạy nhúng (`embedded-postgres`, không Docker) | `pnpm test:api` |
| Kịch bản đồng bộ | mất mạng/có mạng, gửi trùng, đến sai thứ tự, lệch phiên bản, xung đột bàn | `packages/sync-client/test/scenarios/<kịch-bản>.test.ts` | Vitest + API thật | `pnpm test:sync` |
| Component | các component có luật (chọn tùy chọn, bàn phím tiền) | `apps/pos/src/**/<component>.test.tsx` | Vitest + Testing Library | `pnpm test:unit` |
| In | mẫu → byte ESC/POS/TSPL và bản xem trước dạng chữ, so với file golden | `packages/printing/src/templates/<mẫu>.test.ts` + `__golden__/` | Vitest | `pnpm test:unit` |
| E2E | luồng vàng của người dùng thật | `e2e/pos/<luồng>.spec.ts`, `e2e/backoffice/<luồng>.spec.ts` | Playwright (POS bản web) | `pnpm e2e` |
| Phần cứng | máy in thật, két, Sunmi | `e2e/hardware-checklist.md` (tay) | người + Claude | trước mỗi bản phát hành |

## 2. Luật viết test

1. **Kịch bản trong tên test, không mã task:** `voids a line already sent to the bar and prints a cancel ticket`, không phải `T04-16`.
2. **Mỗi luật một test riêng, có kỳ vọng âm:** test "được phép" đi kèm test "bị chặn". Kỳ vọng một chiều không nói được vì sao qua.
3. **Tiền so bằng số nguyên chính xác**, không `toBeCloseTo`.
4. **Property test cho domain:** Σ dòng = tổng đơn; tổng phân bổ = tổng giảm; hoàn ≤ gốc; không số âm ngoài dòng âm cố ý; kết quả không đổi khi đổi thứ tự thêm món.
5. **Không mock thứ đang kiểm.** API test dùng Postgres thật; sync test dùng API thật. Chỉ giả lập bên thứ ba (ngân hàng, nhà cung cấp hóa đơn, máy in) bằng fake có ghi lại lời gọi.
6. **Kịch bản chạy tiếp trên dữ liệu của lần trước:** bộ test đồng bộ có ít nhất một kịch bản không xóa state giữa các bước (bug lần chạy thứ 2 chỉ lộ ra vậy).
7. **Dữ liệu XẤU** từ `packages/test-fixtures/hostile.ts`: tên 80+ ký tự không khoảng trắng, emoji, tổ hợp dấu tiếng Việt, giá 0đ, số lượng lớn, 30 topping, ghi chú nhiều dòng. Mọi màn mới phải có một test UI với bộ này ở khổ 360px và 800px (POS thêm 1280px — máy quầy ngang), đo tràn trên **đúng phần tử đang cuộn**.
8. **E2E đọc mã HTTP và lỗi console**, không chỉ đọc chữ trên màn; chờ bằng thứ chỉ có sau khi React đã chạy (tránh bấm trước khi trang sẵn sàng).
9. **Sửa bug = test tái hiện trước**, đỏ trên code cũ, xanh sau khi sửa; giữ lại vĩnh viễn trong thư mục của miền đó.
10. **Không xóa/skip test để qua cổng.** Test sai thì sửa test và ghi lý do trong commit.
11. **fast-check 4: `fc.date` mặc định sinh cả ngày không hợp lệ (NaN)** — luôn thêm `noInvalidDate: true` hoặc sinh epoch bằng `fc.integer`. Property test xanh ở một lần chạy và đỏ ở lần sau là dấu hiệu bộ sinh dữ liệu có lỗ (đã gặp 2026-10-20).
12. **Test nghiệp vụ trên DB chạy bằng role `fnb_app` bên trong `withTenant`**, không bao giờ bằng owner/superuser (RLS không ràng buộc superuser).
13. **Bảng tenant mới** phải có: ENABLE + FORCE RLS + policy tenant, UNIQUE (tenant_id, id), khóa ngoại kép (tenant_id, parent_id), và thêm vào `TENANT_TABLES` trong `apps/api/test/integration/support/tenant-graph.ts` — thiếu là test catalog RLS đỏ.
14. **Không import `embedded-postgres` trực tiếp trong tiến trình chính của vitest**; đi qua `packages/db/src/test-support/load-embedded-postgres.ts` (import thẳng làm lượt test fail vẫn trả exit 0).
15. **Đo hiệu năng DB trên ổ thật**, không trong `/tmp` (tmpfs: fsync gần như miễn phí, số đẹp gấp ~30 lần).
16. Test tranh chấp đồng thời: các transaction cạnh tranh không được dùng chung một hàng "nóng" (nó tuần tự hóa và che lỗi).
17. Trong `withTenant`, một câu lệnh bị từ chối sẽ hủy cả transaction ⇒ mỗi ca "bị chặn" cần `withTenant` riêng.
18. Bảng chỉ-thêm mới ⇒ thêm vào `APPEND_ONLY_TABLES`; bảng Drizzle mới ⇒ thêm vào `packages/db/src/schema/all-tables.ts`; mỗi bảng tenant có một `RowSpec` trong `apps/api/test/integration/support/tenant-graph-rows.ts`.
19. Thời gian trong API test điều khiển bằng `ManualClock`, không `sleep`.
20. Test đồng thời: pool `max` ≥ số request song song; mở "cửa sổ" giữa hai bước bằng hook giữ lại (vd `observedSecretCheck().hold()`), hoặc giữ transaction sync bằng `withTenant` riêng của test + chờ đối thủ bằng `untilSettledOrWaitingOnLock` — không có seam riêng cho test trong code sản phẩm.
21. Bảng chỉ-thêm mới có cột JSON ⇒ thêm vào `APPEND_ONLY_JSON_COLUMN` (`support/tenant-table-lists.ts`). Khóa ngoại TRỎ VÀO bảng chỉ-thêm làm TRUNCATE lỗi 0A000 trước trigger ⇒ tránh.
22. Lệnh đồng bộ của một máy trong test phải dựng ĐÚNG thứ tự gửi (dựng lệch thứ tự sinh retry SYNC_OUT_OF_ORDER trông như lỗi server).
24. File SQLite của kịch bản đồng bộ đặt trên ổ thật (`packages/sync-client/tmp/`, gitignored), không trong `/tmp` (tmpfs).
25. Khi ghi file qua công cụ của agent, chuỗi `\uXXXX` trong nội dung bị giải mã thành ký tự thật (NBSP…) ⇒ kiểm byte sau khi ghi các file có ký tự đặc biệt.
26. Golden file của gói in: test thường KHÔNG bao giờ ghi golden; thiếu golden là đỏ; cập nhật có chủ đích bằng `pnpm --filter @fnb/printing golden:update`.
27. Máy thiếu RAM: turbo ở strict env mode bỏ biến VITEST_* ⇒ dùng `VITEST_MAX_FORKS=2 VITEST_MAX_THREADS=2 pnpm exec turbo run <task> --concurrency=1 --env-mode=loose`; `pnpm verify` thường chạy ~10 tiến trình tsc/vitest song song.
28. `pnpm e2e` = turbo `test:browser` (hợp đồng LocalStore trong Chrome, bố cục POS với tên xấu ở 360/800/1280, e2e `@fnb/e2e`); dùng Chrome hệ thống qua playwright-core, API thật + Postgres nhúng. Màn POS mới phải thêm vào `apps/pos/test/browser/pages/screen-names.ts`.
29. Component test POS chạy trong jsdom (không có IndexedDB/OPFS/Worker) với LocalStore node:sqlite `:memory:` + server giả; phần IndexedDB/OPFS qua reload do e2e bảo vệ.
30. Test đồng bộ chạy API trên ManualClock (`tillsClock()` / `SERVER_STARTS_AT` trong `apps/api/test/integration/support/sync-commands.ts`, `pushOnTime` cho lệnh ghi giờ muộn hơn): server định giờ lệnh theo lúc nhận, test đọc đồng hồ thật sẽ cho kết quả khác vào ngày khác.
31. Tính năng dựa trên bản sao lạc quan (máy hiện trước khi server trả lời) phải có ít nhất một test giữ lệnh ở trạng thái chờ (offline): server giả trả lời nhanh che mất lỗi (vd đánh số đơn 904 thay vì 2).
32. Mọi snapshot feed khác null PHẢI có `version`, nếu không sync-client ngừng kéo (`SYNC_CLIENT_SNAPSHOT_WITHOUT_VERSION`) — chỉ `test:sync` bắt được, `test:api` không. Entity mới ⇒ chạy `test:sync`.
33. Tiền in bằng `formatVnd` có NBSP: `getByText("39.000 đ")` không bao giờ khớp ⇒ đọc thuộc tính `data-*` hoặc `textContent`. Test của apps/pos chỉ được typecheck qua `tsconfig.node.json` ⇒ dùng `pnpm --filter @fnb/pos typecheck`, đừng `tsc -p tsconfig.json`.
34. ManualClock của test tích hợp cũng là `CallDeadlines` (`signalAfter`): tiến đồng hồ là bắn hạn; `FakeEInvoiceProvider.holdNext(op, {ignoresAbort})` giữ đúng một lời gọi. `support/secret-keys.ts` coi khóa chứa pin/hash/token… là bí mật ⇒ đặt tên trường không bí mật tránh các chữ đó.
23. zod 3: refine vẫn chạy sau khi check trước đã lỗi ⇒ refine gọi BigInt/parse phải tự chặn đầu vào xấu trước.

## 3. Cổng (gate) — tất cả kiểm bằng exit code

```
pnpm verify      # tsc --noEmit + eslint (0 warning) + test:unit
pnpm test:api    # Postgres 17 nhúng, tự khởi động/tắt, ~3s, không cần Docker/root
pnpm test:sync
pnpm e2e         # cần build web của pos + backoffice
pnpm build
```
- Trước mỗi commit: `pnpm verify`. Trước push/merge: tất cả.
- CI chạy đủ 5 lệnh; đỏ thì không merge.
- Định kỳ (mỗi mốc R): chạy mutation test (Stryker) trên `packages/domain` để kiểm test còn bắt được lỗi; điểm sống sót > 10% thì bổ sung test.

## 4. Mức tối thiểu

- `packages/domain`: ≥ 95% dòng và nhánh.
- Mỗi tính năng trong [feature-map](feature-map-by-release.md) phải liệt kê file test của nó; tính năng không có file test thì trạng thái không được là "xong".
- Mỗi luồng vàng của R1 có 1 spec E2E (danh sách ở feature-map).
