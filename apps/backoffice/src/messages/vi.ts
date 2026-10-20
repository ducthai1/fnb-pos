// Every string the backoffice shows. Screens read from here; none writes Vietnamese inline.

import { VI_API_ERRORS } from "./vi-api-errors";
import { VI_DOMAIN_ERRORS } from "./vi-domain-errors";
import { VI_COMMON, VI_LOGIN, VI_SHELL } from "./vi-shell";

export const vi = {
  login: VI_LOGIN,
  shell: VI_SHELL,
  common: VI_COMMON,
  errors: {
    network: "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.",
    /** A code this backoffice does not know yet: the sentence plus the code, for support. */
    unknown: (code: string) => `Có lỗi xảy ra (mã ${code}). Thử lại; nếu vẫn lỗi, báo hỗ trợ.`,
    unexpected: (status: number) => `Máy chủ trả lời bất thường (HTTP ${status}). Thử lại.`,
    byCode: { ...VI_API_ERRORS, ...VI_DOMAIN_ERRORS } as Readonly<Record<string, string>>,
  },
} as const;
