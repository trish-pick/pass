import type { BBox, TextBlock, TitleBlockField } from "@/lib/checks/types";

import { labelKey, overlapY, unionBBox } from "./text";

export type TitleBlockValue = { value: string; bbox: BBox; labelBBox: BBox };

/** How far from a label we look for its value, in points. */
const BELOW_GAP = 14;
const RIGHT_GAP = 160;
const COLUMN_SLACK = 6;
const NEXT_LINE_GAP = 6;

/**
 * Reads title block values by finding each field's printed label and taking
 * the nearest non-label text below it or to its right. Labels are matched as
 * whole lines, or as the start of a line (e.g. "TITLE: 25.09.26" -> "25.09.26").
 */
export function readTitleBlock(
  lines: TextBlock[],
  fields: TitleBlockField[],
): Record<string, TitleBlockValue> {
  const labelKeys = fields.map((f) => labelKey(f.label));
  const isLabel = (line: TextBlock) => {
    const k = labelKey(line.text);
    return labelKeys.some((l) => k === l);
  };

  const result: Record<string, TitleBlockValue> = {};

  for (const field of fields) {
    const key = labelKey(field.label);
    // Prefer the label nearest the bottom-right corner: that is where title blocks live.
    const labels = lines
      .filter((l) => labelKey(l.text) === key || labelKey(l.text).startsWith(key))
      .sort((a, b) => b.bbox.x + b.bbox.y - (a.bbox.x + a.bbox.y));

    for (const label of labels) {
      const found = findValue(label, key, field, lines, isLabel);
      if (found) {
        result[field.key] = found;
        break;
      }
    }
  }

  return result;
}

function findValue(
  label: TextBlock,
  key: string,
  field: TitleBlockField,
  lines: TextBlock[],
  isLabel: (l: TextBlock) => boolean,
): TitleBlockValue | null {
  // Value printed on the same line as the label, e.g. "REVISION NO. Rev03".
  const inline = stripLabel(label.text, key);
  // "PROJECT DETAILS:" is a different label, not a value.
  if (inline && !inline.endsWith(":")) return { value: inline, bbox: label.bbox, labelBBox: label.bbox };

  const lb = label.bbox;
  const direction = field.direction ?? "below";
  const candidates = lines.filter((l) => l !== label && !isLabel(l) && l.text.trim() !== "");

  if (direction === "right") {
    const right = candidates
      .filter((l) => l.bbox.x >= lb.x + lb.width - 2 && l.bbox.x <= lb.x + lb.width + RIGHT_GAP)
      .filter((l) => overlapY(l.bbox, lb, 1))
      .sort((a, b) => a.bbox.x - b.bbox.x);
    const first = right[0];
    return first ? { value: first.text.trim(), bbox: first.bbox, labelBBox: lb } : null;
  }

  // Below: same column, starting just under the label.
  const column = candidates
    .filter((l) => Math.abs(l.bbox.x - lb.x) <= COLUMN_SLACK)
    // Starts below the label's middle: large values can rise slightly into the label's line.
    .filter((l) => l.bbox.y >= lb.y + lb.height * 0.5)
    .sort((a, b) => a.bbox.y - b.bbox.y);

  const first = column[0];
  if (!first || first.bbox.y > lb.y + lb.height + BELOW_GAP) return null;

  const taken = [first];
  const maxLines = field.maxLines ?? 1;
  for (const next of column.slice(1)) {
    if (taken.length >= maxLines) break;
    const prev = taken.at(-1)!;
    if (next.bbox.y > prev.bbox.y + prev.bbox.height + NEXT_LINE_GAP) break;
    taken.push(next);
  }

  // Stop multi-line values at the next label in the column.
  const nextLabel = lines
    .filter((l) => l !== label && isLabel(l) && Math.abs(l.bbox.x - lb.x) <= COLUMN_SLACK && l.bbox.y > lb.y)
    .sort((a, b) => a.bbox.y - b.bbox.y)[0];
  const kept = nextLabel ? taken.filter((l) => l.bbox.y < nextLabel.bbox.y) : taken;
  if (kept.length === 0) return null;

  return {
    value: kept.map((l) => l.text.trim()).join(" "),
    bbox: unionBBox(kept.map((l) => l.bbox)),
    labelBBox: lb,
  };
}

function stripLabel(text: string, key: string): string {
  // Walk the text until the label's characters are consumed, then return the rest.
  let i = 0;
  let matched = 0;
  const lower = text.toLowerCase();
  while (i < lower.length && matched < key.length) {
    const ch = lower[i];
    if (/[\s:.]/.test(ch)) {
      i++;
      continue;
    }
    if (ch !== key[matched]) return "";
    matched++;
    i++;
  }
  if (matched < key.length) return "";
  return text.slice(i).replace(/^[\s:.]+/, "").trim();
}
