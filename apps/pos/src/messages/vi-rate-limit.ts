// What the till says when the API turned a call away for coming too often; vi.ts merges
// these into `vi.errors`. The server says how long to wait (Retry-After) when it can.

export const VI_RATE_LIMIT_ERRORS = {
  API_RATE_LIMITED:
    "Máy gửi quá nhiều yêu cầu cùng lúc nên máy chủ tạm từ chối. Đợi một lát rồi thử lại.",
  rateLimitedFor: (seconds: number) =>
    `Máy gửi quá nhiều yêu cầu cùng lúc nên máy chủ tạm từ chối. Thử lại sau ${seconds} giây.`,
} as const;
