import { normaliseText } from "@/lib/pdf/text";

import type { BBox, CheckContext, ParsedSheet } from "./types";

/** The printed label for a title block field, for messages ("Job No" rather than "job_number"). */
export function fieldLabel(ctx: CheckContext, key: string): string {
  const field = ctx.profile.titleBlockFields.find((f) => f.key === key);
  const label = field?.label.replace(/[\s:.]+$/, "").trim() ?? key.replace(/_/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
}

/** Where a sheet's title block value sits, or null. */
export function valueBox(sheet: ParsedSheet, key: string): BBox | null {
  return sheet.titleBlockBoxes?.[key] ?? null;
}

/** The first line on a sheet containing `text` (case-insensitive), or null. */
export function findLine(sheet: ParsedSheet, text: string): BBox | null {
  const needle = normaliseText(text);
  return sheet.textBlocks.find((l) => normaliseText(l.text).includes(needle))?.bbox ?? null;
}

export function sheetLabel(sheet: ParsedSheet): string {
  return sheet.sheetNumber ?? `page ${sheet.pageIndex + 1}`;
}

/** Words for fuzzy matching: lower case, letters and digits only. "&" counts as "and". */
export function words(text: string): string[] {
  return normaliseText(text)
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/**
 * How well `needle` appears in `haystack`, from 0 to 1: the best word-level
 * similarity of any stretch of the haystack to the needle. Tolerant of line
 * breaks, punctuation and a few changed or missing words.
 */
export function bestMatch(needle: string[], haystack: string[]): number {
  if (needle.length === 0) return 1;
  if (haystack.length === 0) return 0;
  const n = needle.length;
  const anchors = new Set(needle.slice(0, Math.min(4, n)));
  let best = 0;

  for (let start = 0; start < haystack.length; start++) {
    if (!anchors.has(haystack[start])) continue;
    const window = haystack.slice(start, start + n + Math.ceil(n * 0.2));
    const score = 1 - editDistanceAligned(needle, window) / n;
    if (score > best) {
      best = score;
      if (best === 1) break;
    }
  }
  return Math.max(0, best);
}

/** Word edit distance from `a` to the best-matching prefix of `b`. */
function editDistanceAligned(a: string[], b: string[]): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return Math.min(...prev);
}

export function sheetWords(sheet: ParsedSheet): string[] {
  return words(sheet.textBlocks.map((l) => l.text).join(" "));
}

export function stringParam<T extends string>(params: Record<string, unknown>, key: string, fallback: T): T | string {
  const v = params[key];
  return typeof v === "string" && v.trim() ? v : fallback;
}

export function numberParam(params: Record<string, unknown>, key: string, fallback: number): number {
  const v = params[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export function stringListParam(params: Record<string, unknown>, key: string): string[] | null {
  const v = params[key];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && x.trim() !== "");
  if (typeof v === "string" && v.trim()) return v.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
  return null;
}
