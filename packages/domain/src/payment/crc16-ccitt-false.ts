/**
 * CRC-16/CCITT-FALSE (polynomial 0x1021, initial value 0xFFFF, no reflection, no final
 * xor), the checksum EMVCo merchant QR codes end with. Characters are taken as their
 * single-byte codes, so callers pass ASCII only: a QR payload built here never holds
 * anything else.
 */
export function crc16CcittFalse(text: string): number {
  let crc = 0xffff;
  for (let index = 0; index < text.length; index += 1) {
    crc ^= text.charCodeAt(index) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

/** The checksum as the payload writes it: four uppercase hex digits. */
export function crc16Hex(text: string): string {
  return crc16CcittFalse(text).toString(16).toUpperCase().padStart(4, "0");
}
