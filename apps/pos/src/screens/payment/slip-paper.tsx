import { type CSSProperties, useLayoutEffect, useRef } from "react";

/** The characters in the widest line of the slip: how wide the paper is, in type. */
const widestLine = (preview: string): number =>
  Math.max(1, ...preview.split("\n").map((line) => [...line].length));

const SMALLEST_PX = 7;

/**
 * Shrinks the paper's type, in proportion, until its widest line fits the card. The style
 * sheet makes a first guess from the number of columns, but the letters a monospace face
 * lacks (Vietnamese diacritics) come from another face and are wider, so only measuring the
 * real line says how much is cut off. Nothing is done while it fits, and it never grows.
 */
function fitToCard(paper: HTMLElement): void {
  paper.style.removeProperty("font-size");
  const { scrollWidth, clientWidth } = paper;
  if (scrollWidth <= clientWidth + 0.5) return;
  const pad = Number.parseFloat(getComputedStyle(paper).paddingLeft) * 2;
  const start = Number.parseFloat(getComputedStyle(paper).fontSize);
  const ratio = (clientWidth - pad) / (scrollWidth - pad);
  paper.style.fontSize = `${Math.max(SMALLEST_PX, Math.floor(start * ratio * 100) / 100)}px`;
}

/** One slip as the printer puts it on the roll: its own columns, whole, however narrow the card. */
export function SlipPaper({ preview }: { preview: string }) {
  const paper = useRef<HTMLPreElement>(null);
  useLayoutEffect(() => {
    const element = paper.current;
    if (element === null) return undefined;
    fitToCard(element);
    const card = element.closest(".pos-slip") ?? element.parentElement;
    if (card === null || typeof ResizeObserver === "undefined") return undefined;
    // The card is watched, not the paper: resizing the type must not start the watch again.
    const watch = new ResizeObserver(() => fitToCard(element));
    watch.observe(card);
    return () => watch.disconnect();
  }, [preview]);
  return (
    <pre
      ref={paper}
      className="pos-slip__preview"
      style={{ "--slip-cols": widestLine(preview) } as CSSProperties}
    >
      {preview}
    </pre>
  );
}
