import type { BBox, TextBlock } from "@/lib/checks/types";

import { groupRows, normaliseSheetNumber, normaliseText, unionBBox } from "./text";

export type RegisterEntry = { sheetNumber: string; title: string; bbox: BBox };
export type Register = { pageIndex: number; heading: string; entries: RegisterEntry[] };

const MAX_WIDTH = 320;
const MAX_ROW_GAP = 30;

/**
 * Finds the drawing register (a heading such as "Building Drawings" followed by
 * rows of "B 01  Cover Page") and reads its rows. Returns null if no heading
 * is found on the page.
 */
export function readRegister(
  lines: TextBlock[],
  pageIndex: number,
  headings: string[],
  sheetNumberPattern: RegExp,
): Register | null {
  const wanted = headings.map(normaliseText);
  const heading = lines.find((l) => wanted.includes(normaliseText(l.text)));
  if (!heading) return null;

  const hb = heading.bbox;
  const below = lines.filter(
    (l) =>
      l !== heading &&
      l.bbox.y > hb.y + hb.height - 2 &&
      l.bbox.x >= hb.x - 40 &&
      l.bbox.x <= hb.x + MAX_WIDTH,
  );

  const entries: RegisterEntry[] = [];
  let lastY = hb.y + hb.height;
  for (const row of groupRows(below)) {
    if (row[0].bbox.y - lastY > MAX_ROW_GAP) break;
    const entry = parseRow(row, sheetNumberPattern);
    if (!entry) {
      if (entries.length > 0) break;
      continue;
    }
    entries.push(entry);
    lastY = row[0].bbox.y + row[0].bbox.height;
  }

  return { pageIndex, heading: heading.text.trim(), entries };
}

/** A row's sheet number is its longest leading run of up to three pieces that matches the pattern. */
function parseRow(row: TextBlock[], pattern: RegExp): RegisterEntry | null {
  const pieces = row.flatMap((l) => l.text.trim().split(/\s+/).map((t) => ({ t, l })));
  for (let n = Math.min(3, pieces.length - 1); n >= 1; n--) {
    const candidate = normaliseSheetNumber(pieces.slice(0, n).map((p) => p.t).join(""));
    if (pattern.test(candidate)) {
      const title = pieces.slice(n).map((p) => p.t).join(" ").trim();
      if (!title) return null;
      return { sheetNumber: candidate, title, bbox: unionBBox(row.map((l) => l.bbox)) };
    }
  }
  return null;
}
