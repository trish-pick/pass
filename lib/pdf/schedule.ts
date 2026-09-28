import type { BBox, TextBlock } from "@/lib/checks/types";

import { normaliseText } from "./text";

export type ScheduleRow = { mark: string; bbox: BBox };
export type Schedule = { heading: string; bbox: BBox; rows: ScheduleRow[] };

const MARK = /^[A-Za-z]{0,2}\s?\d{1,3}[a-z]?$/;
const MAX_ROW_GAP = 40;

/**
 * Reads the Mark column of a schedule table: the heading (e.g. "Window
 * Schedule"), then the "Mark" column header under it, then the marks below.
 */
export function readSchedules(lines: TextBlock[], headings: string[], markHeader = "Mark"): Schedule[] {
  const wanted = headings.map(normaliseText);
  const schedules: Schedule[] = [];

  for (const heading of lines.filter((l) => wanted.includes(normaliseText(l.text)))) {
    const hb = heading.bbox;
    const header = lines
      .filter(
        (l) =>
          normaliseText(l.text) === normaliseText(markHeader) &&
          l.bbox.y > hb.y &&
          l.bbox.y < hb.y + hb.height + 60 &&
          l.bbox.x > hb.x - 400 &&
          l.bbox.x < hb.x + hb.width + 400,
      )
      .sort((a, b) => a.bbox.y - b.bbox.y || Math.abs(a.bbox.x - hb.x) - Math.abs(b.bbox.x - hb.x))[0];
    if (!header) continue;

    // Stop at the next "Mark" header below, in case another table sits under this one.
    const nextHeader = lines
      .filter((l) => l !== header && normaliseText(l.text) === normaliseText(markHeader) && l.bbox.y > header.bbox.y)
      .filter((l) => Math.abs(l.bbox.x - header.bbox.x) < 80)
      .sort((a, b) => a.bbox.y - b.bbox.y)[0];
    const bottom = nextHeader ? nextHeader.bbox.y : Infinity;

    const x0 = header.bbox.x - 40;
    const x1 = header.bbox.x + header.bbox.width + 12;
    const column = lines
      .filter((l) => l.bbox.y > header.bbox.y + 2 && l.bbox.y < bottom && l.bbox.x >= x0 && l.bbox.x <= x1)
      .sort((a, b) => a.bbox.y - b.bbox.y);

    const rows: ScheduleRow[] = [];
    let lastY = header.bbox.y;
    for (const line of column) {
      if (line.bbox.y - lastY > MAX_ROW_GAP) break;
      const text = line.text.trim();
      if (!MARK.test(text)) {
        if (rows.length > 0) break;
        continue;
      }
      rows.push({ mark: text.replace(/\s+/g, ""), bbox: line.bbox });
      lastY = line.bbox.y;
    }
    schedules.push({ heading: heading.text.trim(), bbox: hb, rows });
  }
  return schedules;
}
