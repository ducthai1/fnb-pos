/** The till's bar and main navigation, around every signed-in screen. */
export const VI_SHELL = {
  barLabel: "Thông tin máy bán hàng",
  /** A business date as the till shows it: 2026-10-21 → 21/10. */
  shiftOf: (businessDate: string) => {
    const [, month, day] = businessDate.split("-");
    return month === undefined || day === undefined
      ? `Ca ${businessDate}`
      : `Ca ngày ${day}/${month}`;
  },
  noShift: "Chưa mở ca",
  placeLine: (branch: string, device: string) => `${branch} · ${device}`,
  pickStaffHint: "Chạm vào tên của bạn để vào ca.",
} as const;
