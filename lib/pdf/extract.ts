import * as mupdf from "mupdf";

import type { TextBlock } from "@/lib/checks/types";

import type { ExtractedPage } from "./parse-set";

/**
 * Extracts every line of text with its position from a PDF. Server only
 * (MuPDF runs as WebAssembly in Node).
 */
export function extractPages(
  pdf: Uint8Array,
  onPage?: (done: number, total: number) => void,
): ExtractedPage[] {
  const doc = mupdf.Document.openDocument(pdf, "application/pdf");
  try {
    const total = doc.countPages();
    const pages: ExtractedPage[] = [];
    for (let i = 0; i < total; i++) {
      const page = doc.loadPage(i);
      const [x0, y0, x1, y1] = page.getBounds();
      const st = page.toStructuredText("preserve-whitespace");
      const json = JSON.parse(st.asJSON()) as StructuredJSON;
      st.destroy();
      const lines: TextBlock[] = [];
      for (const block of json.blocks) {
        if (block.type !== "text") continue;
        for (const line of block.lines ?? []) {
          if (!line.text.trim()) continue;
          lines.push({
            text: line.text,
            bbox: { x: line.bbox.x, y: line.bbox.y, width: line.bbox.w, height: line.bbox.h },
            size: line.font?.size,
          });
        }
      }
      pages.push({ pageIndex: i, width: x1 - x0, height: y1 - y0, lines });
      page.destroy();
      onPage?.(i + 1, total);
    }
    return pages;
  } finally {
    doc.destroy();
  }
}

/** Renders one page to PNG at the given resolution. */
export function renderPagePng(pdf: Uint8Array, pageIndex: number, dpi = 100): Uint8Array {
  const doc = mupdf.Document.openDocument(pdf, "application/pdf");
  try {
    const page = doc.loadPage(pageIndex);
    const pixmap = page.toPixmap(mupdf.Matrix.scale(dpi / 72, dpi / 72), mupdf.ColorSpace.DeviceRGB, false, true);
    const png = pixmap.asPNG();
    pixmap.destroy();
    page.destroy();
    return png;
  } finally {
    doc.destroy();
  }
}

type StructuredJSON = {
  blocks: Array<{
    type: string;
    lines?: Array<{ text: string; bbox: { x: number; y: number; w: number; h: number }; font?: { size?: number } }>;
  }>;
};
