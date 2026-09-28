import type { BBox, TextBlock } from "@/lib/checks/types";

/** Lower-case, collapse whitespace, straighten quotes. */
export function normaliseText(s: string): string {
  return s
    .replace(/[‘’′]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Label comparison key: no case, spaces or trailing punctuation. "REVISION NO." -> "revisionno" */
export function labelKey(s: string): string {
  return normaliseText(s).replace(/[\s:.]+/g, "");
}

/** Sheet numbers compare without spaces, with an upper-case prefix: "b 01" -> "B01", "A 04a" -> "A04a". */
export function normaliseSheetNumber(s: string): string {
  return s.replace(/\s+/g, "").replace(/^[a-z]+/i, (m) => m.toUpperCase());
}

export function centre(b: BBox) {
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

export function overlapY(a: BBox, b: BBox, tolerance = 0): boolean {
  return a.y - tolerance < b.y + b.height && b.y - tolerance < a.y + a.height;
}

/** Sort lines top-to-bottom, then left-to-right, treating lines within `tolerance` points as one row. */
export function readingOrder(lines: TextBlock[], tolerance = 3): TextBlock[] {
  return [...lines].sort((a, b) =>
    Math.abs(a.bbox.y - b.bbox.y) <= tolerance ? a.bbox.x - b.bbox.x : a.bbox.y - b.bbox.y,
  );
}

/** Group lines into rows by their vertical position. */
export function groupRows(lines: TextBlock[], tolerance = 3): TextBlock[][] {
  const rows: TextBlock[][] = [];
  for (const line of readingOrder(lines, tolerance)) {
    const row = rows.at(-1);
    if (row && Math.abs(row[0].bbox.y - line.bbox.y) <= tolerance) row.push(line);
    else rows.push([line]);
  }
  return rows.map((r) => r.sort((a, b) => a.bbox.x - b.bbox.x));
}

/** All text on a sheet as one string, in reading order. */
export function sheetText(lines: TextBlock[]): string {
  return readingOrder(lines).map((l) => l.text).join(" ");
}

export function unionBBox(boxes: BBox[]): BBox {
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.width));
  const y1 = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}
