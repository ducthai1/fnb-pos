/**
 * Every Vietnamese letter, lower and upper case, bare and under each of the five tones
 * (huyền, sắc, ngã, hỏi, nặng), with its Windows-1258 bytes ("ấ:e2-ec" = bytes E2 EC). Written
 * down from Python's cp1258 codec, not from this package, so the encoder is checked against an
 * outside reference.
 */
const ROWS = [
  "a:61 à:e0 á:e1 ã:61-de ả:61-d2 ạ:61-f2",
  "A:41 À:c0 Á:c1 Ã:41-de Ả:41-d2 Ạ:41-f2",
  "ă:e3 ằ:e3-cc ắ:e3-ec ẵ:e3-de ẳ:e3-d2 ặ:e3-f2",
  "Ă:c3 Ằ:c3-cc Ắ:c3-ec Ẵ:c3-de Ẳ:c3-d2 Ặ:c3-f2",
  "â:e2 ầ:e2-cc ấ:e2-ec ẫ:e2-de ẩ:e2-d2 ậ:e2-f2",
  "Â:c2 Ầ:c2-cc Ấ:c2-ec Ẫ:c2-de Ẩ:c2-d2 Ậ:c2-f2",
  "e:65 è:e8 é:e9 ẽ:65-de ẻ:65-d2 ẹ:65-f2",
  "E:45 È:c8 É:c9 Ẽ:45-de Ẻ:45-d2 Ẹ:45-f2",
  "ê:ea ề:ea-cc ế:ea-ec ễ:ea-de ể:ea-d2 ệ:ea-f2",
  "Ê:ca Ề:ca-cc Ế:ca-ec Ễ:ca-de Ể:ca-d2 Ệ:ca-f2",
  "i:69 ì:69-cc í:ed ĩ:69-de ỉ:69-d2 ị:69-f2",
  "I:49 Ì:49-cc Í:cd Ĩ:49-de Ỉ:49-d2 Ị:49-f2",
  "o:6f ò:6f-cc ó:f3 õ:6f-de ỏ:6f-d2 ọ:6f-f2",
  "O:4f Ò:4f-cc Ó:d3 Õ:4f-de Ỏ:4f-d2 Ọ:4f-f2",
  "ô:f4 ồ:f4-cc ố:f4-ec ỗ:f4-de ổ:f4-d2 ộ:f4-f2",
  "Ô:d4 Ồ:d4-cc Ố:d4-ec Ỗ:d4-de Ổ:d4-d2 Ộ:d4-f2",
  "ơ:f5 ờ:f5-cc ớ:f5-ec ỡ:f5-de ở:f5-d2 ợ:f5-f2",
  "Ơ:d5 Ờ:d5-cc Ớ:d5-ec Ỡ:d5-de Ở:d5-d2 Ợ:d5-f2",
  "u:75 ù:f9 ú:fa ũ:75-de ủ:75-d2 ụ:75-f2",
  "U:55 Ù:d9 Ú:da Ũ:55-de Ủ:55-d2 Ụ:55-f2",
  "ư:fd ừ:fd-cc ứ:fd-ec ữ:fd-de ử:fd-d2 ự:fd-f2",
  "Ư:dd Ừ:dd-cc Ứ:dd-ec Ữ:dd-de Ử:dd-d2 Ự:dd-f2",
  "y:79 ỳ:79-cc ý:79-ec ỹ:79-de ỷ:79-d2 ỵ:79-f2",
  "Y:59 Ỳ:59-cc Ý:59-ec Ỹ:59-de Ỷ:59-d2 Ỵ:59-f2",
  "đ:f0",
  "Đ:d0",
];

export const VIETNAMESE_LETTERS_CP1258: readonly (readonly [letter: string, hex: string])[] =
  ROWS.flatMap((row) =>
    row.split(" ").map((pair) => {
      const [letter = "", hex = ""] = pair.split(":");
      return [letter, hex.replaceAll("-", " ")] as const;
    }),
  );
