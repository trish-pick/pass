import { normaliseRevision } from "@/lib/checks/revision-consistent";
import type { ParsedSheet } from "@/lib/checks/types";

/** Job numbers compare on their digits: "FS24003", "TCP-24003" and "24003" are the same job. */
export function jobDigits(value: string | null | undefined): string | null {
  const m = value?.match(/(\d{4,6})(?!.*\d{4,6})/);
  return m ? m[1] : null;
}

/** Parses 27.02.26, 27/02/2026, 5 Feb 2025 and similar to a timestamp, or null. */
export function parseDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = value.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return Date.UTC(year, Number(m[2]) - 1, Number(m[1]));
  }
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

export function sameRevision(a: string, b: string): boolean {
  return normaliseRevision(a) === normaliseRevision(b);
}

/**
 * Compares classification-style values loosely: every class code on the
 * consultant's side must appear on the practice's side.
 * "P/A" vs "Class P (A to Dolerite Bedrock)" -> match; "BAL-19" vs "19" -> match.
 */
export function valuesAgree(consultant: string, ours: string): boolean {
  const codes = (s: string) =>
    new Set(
      s
        .toUpperCase()
        .replace(/\b(CLASS|BAL|ASSUMED|SITE|WIND|STARS?)\b/g, " ")
        .split(/[^A-Z0-9.]+/)
        .map((t) => t.replace(/\.0$/, "").replace(/^\.|\.$/g, ""))
        .filter((t) => t && (t.length <= 4 || /^\d/.test(t))),
    );
  const theirs = codes(consultant);
  const mine = codes(ours);
  return theirs.size > 0 && [...theirs].every((c) => mine.has(c));
}

/** The street number and name, e.g. "111 RAVENSWOOD ROAD" -> ["111", "ravenswood"]. */
export function addressKey(address: string): string[] {
  const m = address.toLowerCase().match(/(\d+[a-z]?(?:\s*[-&]\s*\d+[a-z]?)?)\s+([a-z']+)/);
  return m ? [m[1].replace(/\s+/g, ""), m[2]] : [];
}

/** The practice's own values for comparison: most common title block values, and the cover's. */
export function practiceValues(sheets: ParsedSheet[]) {
  const others = sheets.filter((s) => s.sheetType !== "cover");
  const cover = sheets.find((s) => s.sheetType === "cover");
  const common = (key: string) => {
    const counts = new Map<string, number>();
    for (const s of others) {
      const v = s.titleBlock[key]?.trim();
      if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };
  return {
    jobNumber: common("job_number"),
    date: common("date"),
    project: common("project"),
    cover: cover?.titleBlock ?? {},
    coverText: cover?.textBlocks.map((l) => l.text).join(" ") ?? "",
  };
}
