import { randomInt } from "node:crypto";
import { DEV_STACK_PATHS } from "../dev-stack/dev-stack-paths";
import { loadOrGenerateDevStackLogins } from "../dev-stack/dev-stack-generated-logins";
import { livePids, readRunningStack } from "../dev-stack/running-stack-file";
import { readNoticeArguments, sepayDevNotice } from "./sepay-dev-notice";

/**
 * `pnpm dev:bank-notice <mã nội dung> <số tiền>`: tells the running dev stack that money
 * arrived in the sample branch's account, the way SePay would, so a QR shown on the till
 * confirms itself without a real bank.
 */
const args = readNoticeArguments(process.argv.slice(2));
if (!args.ok) {
  console.error(
    "Cách dùng: pnpm dev:bank-notice <mã nội dung, vd FNB7K2M9QXA> <số tiền, vd 64000>",
  );
  process.exit(2);
}
const stack = await readRunningStack();
if (stack === null || livePids(stack.pids).length === 0) {
  console.error("Chưa có pnpm dev:stack nào đang chạy. Chạy nó trước ở một cửa sổ khác.");
  process.exit(1);
}
const { apiUrl, tenantId } = stack;
if (apiUrl === undefined || tenantId === undefined) {
  console.error("pnpm dev:stack đang khởi động. Đợi nó in xong địa chỉ rồi chạy lại.");
  process.exit(1);
}
const { logins } = await loadOrGenerateDevStackLogins(DEV_STACK_PATHS.logins);
const notice = sepayDevNotice({
  tenantId,
  secret: logins.sepaySecret,
  content: args.content,
  amount: args.amount,
  at: new Date(),
  transactionId: randomInt(1, 2 ** 31),
});
const response = await fetch(`${apiUrl}${notice.path}`, {
  method: "POST",
  headers: notice.headers,
  body: JSON.stringify(notice.body),
});
const answer = await response.text();
console.log(`Ngân hàng giả đã báo ${args.amount.toLocaleString("vi-VN")}đ "${args.content}"`);
console.log(`API trả ${response.status}: ${answer}`);
process.exit(response.ok ? 0 : 1);
