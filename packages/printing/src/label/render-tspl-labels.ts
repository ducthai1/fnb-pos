import { concatBytes } from "../bytes/bytes";
import { spreadLarge } from "../render/render-preview";
import {
  tsplClear,
  tsplCodePage,
  tsplGap,
  tsplPrint,
  tsplSize,
  tsplText,
} from "../tspl/tspl-commands";
import { printWidth } from "../text/print-cells";
import { printedText } from "../text/printed-text";
import { type Label, type TsplProfile, labelColumns, layOutLabel } from "./lay-out-label";

export type MoreLinesText = (hidden: number) => string;

/** One chunk for the setup, then one per label, each cleared and printed on its own. */
export function renderTsplChunks(
  labels: readonly Label[],
  profile: TsplProfile,
  moreLines: MoreLinesText,
): Uint8Array[] {
  const setup = concatBytes(
    tsplSize(profile.widthMm, profile.heightMm),
    tsplGap(profile.gapMm),
    profile.codePage === null ? [] : tsplCodePage(profile.codePage),
  );
  const font = profile.font.name;
  return [
    setup,
    ...labels.map((label) =>
      concatBytes(
        tsplClear(),
        ...layOutLabel(label, profile, moreLines).map((line) => {
          const scale = line.large ? 2 : 1;
          const options = { x: line.x, y: line.y, font, xScale: scale, yScale: scale };
          return tsplText(line.text, options, profile.encoding);
        }),
        tsplPrint(),
      ),
    ),
  ];
}

export function renderTspl(
  labels: readonly Label[],
  profile: TsplProfile,
  moreLines: MoreLinesText,
): Uint8Array {
  return concatBytes(...renderTsplChunks(labels, profile, moreLines));
}

/** Each label drawn as a box of its lines as the printer spells them, as wide as the label. */
export function renderLabelPreview(
  labels: readonly Label[],
  profile: TsplProfile,
  moreLines: MoreLinesText,
): string {
  const columns = labelColumns(profile);
  const border = `+${"-".repeat(columns)}+`;
  const boxes = labels.map((label) => {
    const rows = layOutLabel(label, profile, moreLines).map((line) => {
      const printed = printedText(line.text, profile.encoding);
      const text = line.large ? spreadLarge(printed) : printed;
      return `|${text}${" ".repeat(Math.max(0, columns - printWidth(text)))}|`;
    });
    return [border, ...rows, border].join("\n");
  });
  return `${boxes.join("\n")}\n`;
}
