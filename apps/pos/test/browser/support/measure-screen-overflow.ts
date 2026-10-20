import type { Page } from "playwright-core";

export interface ScreenOverflow {
  /** How far the screen's own scroller is wider than itself; 0 when nothing sticks out. */
  scrollerExcess: number;
  pageExcess: number;
  /** Elements whose box reaches past the scroller's left or right edge. */
  outside: string[];
  text: string;
}

// Measured on the element that scrolls (ScreenFrame), not on the document: the POS never
// lets the page scroll, so the document would stay its width while the screen overflows.
export const measureScreenOverflow = (page: Page): Promise<ScreenOverflow> =>
  page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>("[data-scroll-root]");
    if (scroller === null) throw new Error("no [data-scroll-root] on the screen");
    const edge = scroller.getBoundingClientRect();
    const outside = [...scroller.querySelectorAll<HTMLElement>("*")]
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return box.width > 0 && (box.right > edge.right + 0.5 || box.left < edge.left - 0.5);
      })
      .map((element) => `${element.tagName.toLowerCase()}.${element.className}`);
    const html = document.documentElement;
    return {
      scrollerExcess: scroller.scrollWidth - scroller.clientWidth,
      pageExcess: html.scrollWidth - html.clientWidth,
      outside,
      text: scroller.innerText,
    };
  });
